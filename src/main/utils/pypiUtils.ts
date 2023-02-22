import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { LogManager } from '../log/logManager';
import { PypiTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/pypiTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ProjectDetails } from '../types/projectDetails';
import { ScanUtils } from './scanUtils';
import { PipDepTree } from '../types/pipDepTree';
import { VirtualEnvPypiTree } from '../treeDataProviders/dependenciesTree/dependenciesRoot/virtualEnvPypiTree';
import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { EnvironmentTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/environmentTreeNode';
import { DependencyUtils } from '../treeDataProviders/utils/dependencyUtils';
import { StepProgress } from '../treeDataProviders/utils/stepProgress';
import { ScanResults, DependencyScanResults } from '../types/workspaceIssuesDetails';
import { PackageType } from '../types/projectType';

export class PypiUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/*requirements*.txt' };
    public static readonly PYTHON_SCRIPTS: string = path.join(ScanUtils.RESOURCES_DIR, 'python');
    public static readonly PIP_DEP_TREE_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'pipDepTree.py');
    public static readonly CHECK_VENV_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'checkVenv.py');
    public static readonly packageRegex: RegExp = /([\w\-.]+)\s*(?:\[.*\])?\s*((?:\s*(?:[<>]=?|!=|===?|~=)\s*[\w*\-.]+,?)*)/gms;
    public static readonly removeFlagCommentRegex: RegExp = /^(?:(?!#|-e).)*$/gms;
    public static readonly setupPyProjectNameRegex: RegExp = /name=\s*(?:"|')(.*)(?:"|')/gm;
    public static readonly installReqRegex: RegExp = /install_requires\s*=\s*\[([^\]]+)\]/gm;

    public static searchProjectName(setupPyFile: string): string {
        const content: string = fs.readFileSync(setupPyFile, 'utf8');
        const [, name] = new RegExp(PypiUtils.setupPyProjectNameRegex).exec(content) || [];
        return name;
    }

    public static getSetupPyDirectDependencies(path: string): Map<string, string | undefined> {
        const content: string = fs.readFileSync(path, 'utf8');
        // Use a regular expression to match the install_requires field
        const match: RegExpExecArray | null = new RegExp(PypiUtils.installReqRegex).exec(content);
        if (!match) {
            return new Map<string, string | undefined>();
        }
        return this.matchPythonDependencies(match[1]);
    }

    private static matchPythonDependencies(rawDependencies: string): Map<string, string | undefined> {
        let dependencyMatch: RegExpExecArray | null;
        // let cleanRawDependencies: RegExpExecArray | null;
        let dependencies: Map<string, string | undefined> = new Map<string, string | undefined>();
        const cleanMatch: RegExpExecArray | null = new RegExp(PypiUtils.removeFlagCommentRegex).exec(rawDependencies);
        if (!cleanMatch) {
            return dependencies;
        }
        for (const cleanedMatch of cleanMatch) {
            const match: RegExp = new RegExp(PypiUtils.packageRegex);
            while ((dependencyMatch = match.exec(cleanedMatch)) !== null) {
                const [, name, version] = dependencyMatch;
                dependencies.set(name.toLowerCase(), version);
            }
        }
        return dependencies;
    }
    /**
     * Get setup.py file and return the position of 'install_requires' section.
     * @param document - setup.py file
     */
    public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        let res: vscode.Position[] = [];
        let packageJsonContent: string = document.getText();
        let dependenciesMatch: RegExpMatchArray | null = packageJsonContent.match('install_requires(s*)=');
        if (!dependenciesMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependenciesMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependenciesMatch[0].length));
        return res;
    }

    /**
     * Get requirements file and dependencies tree node. return the position of the dependency in the requirements file.
     * @param document             - requirements file
     * @param artifactId           - dependencies tree node id
     */
    public static getDependencyPosition(document: vscode.TextDocument, artifactId: string): vscode.Range[] {
        let requirementsContent: string = document.getText().toLowerCase();
        let res: vscode.Range[] = [];
        let dependencyMatch: RegExpMatchArray | null = requirementsContent.match(artifactId);
        if (!dependencyMatch) {
            return res;
        }
        let startPos: vscode.Position = document.positionAt(<number>dependencyMatch.index);
        res.push(new vscode.Range(startPos, new vscode.Position(startPos.line, startPos.character + dependencyMatch[0].length)));
        return res;
    }

    /**
     * @param descriptors      - Paths to setup.py and requirements*.txt files
     * @param workspaceFolders - Base workspace folders
     * @param componentsToScan - Set of setup.py components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - Scan trees manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        descriptors: vscode.Uri[] | undefined,
        workspace: vscode.WorkspaceFolder,
        projectsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        checkCanceled: () => void
    ): Promise<void> {
        if (!descriptors) {
            treesManager.logManager.logMessage('No setup.py or requirements.txt files found in workspaces.', 'DEBUG');
            return;
        }
        const pythonPath: string | undefined = await this.getPythonInterpreterPath(treesManager);
        if (!pythonPath) {
            return;
        }
        if (!PypiUtils.isInVirtualEnv(pythonPath, treesManager.logManager)) {
            treesManager.logManager.logError(
                new Error(
                    'Please install and activate a virtual environment before running Xray scan. Then, install your Python project in that environment.'
                ),
                true
            );
            return;
        }
        const pipDepTree: PipDepTree[] | undefined = this.runPipDepTree(pythonPath, treesManager.logManager);
        if (!pipDepTree) {
            return;
        }
        const pythonTrees: PypiTreeNode[] = await this.descriptorsToDependencyTrees(descriptors, pipDepTree, checkCanceled, treesManager, parent);
        pythonTrees.forEach(tree => projectsToScan.push(tree.projectDetails));
        this.workspaceToDependencyTree(workspace, pythonPath, pipDepTree, parent, projectsToScan);
    }

    private static async getPythonInterpreterPath(treesManager: TreesManager) {
        const pythonExtension: vscode.Extension<any> | undefined = await PypiUtils.getAndActivatePythonExtension();
        if (!pythonExtension) {
            treesManager.logManager.logError(
                new Error(
                    'Could not scan python project dependencies, because Python extension is not installed. ' +
                        'Please install Python extension: https://marketplace.visualstudio.com/items?itemName=ms-python.python'
                ),
                true
            );
            return;
        }

        let pythonPath: string | undefined = await PypiUtils.getPythonPath(pythonExtension);
        if (!pythonPath) {
            treesManager.logManager.logError(new Error('Could not scan python Python dependencies, because python interpreter is not set.'), true);
        }
        return pythonPath;
    }
    /**
     * Return reference to the VS-Code Python extension if installed.
     * Activate it to allow tracking on environmental changes -
     * If virtual env is not installed, we want that the Python extension will detect new virtualenv environments and suggest activation.
     */
    public static async getAndActivatePythonExtension(): Promise<vscode.Extension<any> | undefined> {
        let pythonExtension: vscode.Extension<any> | undefined = vscode.extensions.getExtension('ms-python.python');
        if (!pythonExtension) {
            return;
        }
        if (!pythonExtension.isActive) {
            await pythonExtension.activate();
        }
        return pythonExtension;
    }

    /**
     * Return python path as configured in Python extension.
     * @param pythonExtension - The python extension
     * @param descriptor - Base workspace folder
     */
    private static async getPythonPath(pythonExtension: vscode.Extension<any>): Promise<string | undefined> {
        let executionDetails: any = pythonExtension?.exports.settings.getExecutionDetails();
        let execCommand: string[] | undefined = executionDetails?.execCommand;
        return execCommand ? execCommand[0] : undefined;
    }

    /**
     * Return true iff the input Python interpreter is inside virtual environment.
     * @param pythonPath      - Path to python interpreter
     * @param workspaceFolder - Base workspace folder
     */
    public static isInVirtualEnv(pythonPath: string, logManager: LogManager): boolean {
        try {
            ScanUtils.executeCmd(`"${pythonPath}" "${PypiUtils.CHECK_VENV_SCRIPT}"`);
            return true;
        } catch (error) {
            logManager.logError(<any>error, false);
            return false;
        }
    }

    public static runPipDepTree(pythonPath: string, logManager: LogManager): PipDepTree[] | undefined {
        let projectDependencies: PipDepTree[] | undefined;
        try {
            projectDependencies = JSON.parse(ScanUtils.executeCmd(`"${pythonPath}" "${PypiUtils.PIP_DEP_TREE_SCRIPT}" --json-tree`).toString());
        } catch (error) {
            logManager.logError(<any>error, true);
        }
        return projectDependencies;
    }

    /**
     * Create a dependency tree for each descriptor path based on its dependencies declaration.
     * @param descriptors - Path to descriptors
     * @param pipDepTree - project dependency tree
     * @param parent - Parent of all the descriptors
     * @returns All descriptors dependency trees
     */
    public static async descriptorsToDependencyTrees(
        descriptors: vscode.Uri[],
        pipDepTree: PipDepTree[],
        checkCanceled: () => void,
        treesManager: TreesManager,
        parent: DependenciesTreeNode
    ): Promise<PypiTreeNode[]> {
        const projectName: string | undefined = this.getProjectName(descriptors);
        const trees: PypiTreeNode[] = [];
        for (const descriptor of descriptors) {
            checkCanceled();
            treesManager.logManager.logMessage(`Analyzing '${descriptor.fsPath}' file`, 'INFO');
            let root: PypiTreeNode = new PypiTreeNode(descriptor.fsPath, parent);
            root.refreshDependencies(this.filterDescriptorDependencies(descriptor.fsPath, pipDepTree, projectName));
            trees.push(root);
        }
        return trees;
    }

    /**
     * Create a virtual environment tree node with all its dependencies
     * @param workspace - Workspace to scan.
     * @param virtualEnvPath - Path to workspace virtual environment.
     * @param pipDepTree - virtual environment dependencies tree (json format).
     * @param parent - Workspace tree node.
     */
    public static async workspaceToDependencyTree(
        workspace: vscode.WorkspaceFolder,
        virtualEnvPath: string,
        pipDepTree: PipDepTree[],
        parent: DependenciesTreeNode,
        projectsToScan: ProjectDetails[]
    ) {
        let root: VirtualEnvPypiTree = new VirtualEnvPypiTree(virtualEnvPath, workspace.uri.fsPath, parent);
        root.refreshDependencies(pipDepTree);
        parent.children.push(root);
        projectsToScan.push(root.projectDetails);
    }

    /**
     *  Get the dependencies of the descriptor from those of the environment.
     * @param pipDepTree - virtual environment dependencies tree (json format).
     * @param projectName  Name of the project as written in setup.py.
     */
    private static filterDescriptorDependencies(descriptorPath: string, pipDepTree: PipDepTree[], projectName?: string): PipDepTree[] {
        const isSetupPy: boolean = descriptorPath.endsWith('setup.py');
        const dependencies: Map<string, string | undefined> = isSetupPy
            ? this.getSetupPyDirectDependencies(descriptorPath)
            : this.getRequirementsTxtDirectDependencies(descriptorPath);
        if (!dependencies) {
            return pipDepTree;
        }
        return this.filterDependencies(dependencies, pipDepTree, false, projectName);
    }

    /**
     * From pipDepTree, which contains all the environment dependencies, get the dependencies of the dependencies' map
     */
    public static filterDependencies(
        dependencies: Map<string, string | undefined>,
        pipDepTree: PipDepTree[],
        isSetupPy: boolean,
        projectName?: string
    ): PipDepTree[] {
        let filtered: PipDepTree[] = [];
        if (dependencies.size === 0) {
            return filtered;
        }
        for (const dep of pipDepTree) {
            if (dep.key === projectName) {
                filtered.push(...this.filterDependencies(dependencies, dep.dependencies, isSetupPy));
            }
            if (!dependencies.has(dep.key)) {
                continue;
            }
            const version: string | undefined = dependencies.get(dep.key);
            if (version && !this.isVersionsEqual(dep, version, isSetupPy)) {
                continue;
            }
            filtered.push(dep);
        }
        return filtered;
    }

    private static isVersionsEqual(dependencyFromPipDepTree: PipDepTree, depFromDescriptor: string, isSetupPy: boolean): boolean {
        if (isSetupPy) {
            return dependencyFromPipDepTree.required_version === depFromDescriptor;
        }
        return depFromDescriptor.endsWith(dependencyFromPipDepTree.installed_version);
    }

    private static getProjectName(descriptors: vscode.Uri[]): string | undefined {
        const setupPy: vscode.Uri | undefined = descriptors.find(descriptor => descriptor.fsPath.endsWith('setup.py'));
        if (!setupPy) {
            return;
        }
        return this.searchProjectName(setupPy.fsPath);
    }

    public static getRequirementsTxtDirectDependencies(path: string): Map<string, string | undefined> {
        const content: string = fs.readFileSync(path, 'utf8');
        return this.matchPythonDependencies(content);
    }

    public static getEnvironmentScanTaskArgs(
        scanResults: ScanResults,
        workspaceDependenciesTree: DependenciesTreeNode,
        progressManager: StepProgress,
        logManager: LogManager
    ): [DependencyScanResults?, EnvironmentTreeNode?, RootNode?] {
        const envIssues: DependenciesTreeNode | undefined = workspaceDependenciesTree.getChildByPath(scanResults.path);
        if (!envIssues || !(envIssues instanceof VirtualEnvPypiTree)) {
            return [];
        }
        let environmentGraph: RootNode | undefined = DependencyUtils.getDependencyGraph(
            workspaceDependenciesTree,
            scanResults.path,
            PackageType.Python
        );
        if (!environmentGraph) {
            progressManager.reportProgress(2 * progressManager.getStepIncValue);
            logManager.logMessage("Can't find virtual environment graph at " + envIssues.virtualEnvironmentPath, 'DEBUG');
            return [];
        }
        return [envIssues.toDependencyScanResults(), envIssues.toEnvironmentTreeNode(), environmentGraph];
    }
}
