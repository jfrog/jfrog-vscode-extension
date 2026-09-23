import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse as parseToml } from 'smol-toml';
import { LogManager } from '../log/logManager';
import { PypiTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/pypiTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { ScanUtils } from './scanUtils';
import { PipDepTree } from '../types/pipDepTree';
import { PyprojectPoetryTable, PyprojectToml } from '../types/pyprojectToml';
import { ParsedPythonDescriptor } from '../types/parsedPythonDescriptor';
import { VirtualEnvPypiTree } from '../treeDataProviders/dependenciesTree/dependenciesRoot/virtualEnvPypiTree';

export class PypiUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/*requirements*.txt' };
    public static readonly PYTHON_SCRIPTS: string = path.join(ScanUtils.RESOURCES_DIR, 'python');
    public static readonly PIP_DEP_TREE_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'pipDepTree.py');
    public static readonly CHECK_VENV_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'checkVenv.py');
    public static readonly packageRegex: RegExp = /([\w\-.]+)\s*(?:\[.*\])?\s*((?:\s*(?:[<>]=?|!=|===?|~=)\s*[\w*\-.]+,?)*)/gms;
    public static readonly removeFlagCommentRegex: RegExp = /^(?:(?!#|-e).)*$/gms;
    public static readonly setupPyProjectNameRegex: RegExp = /name=\s*(?:"|')(.*)(?:"|')/gm;
    public static readonly installReqRegex: RegExp = /install_requires\s*=\s*\[([^\]]+)\]/gm;
    public static readonly requirementRegex: RegExp = /^([\w\-.]+)\s*(?:\[[^\]]*\])?\s*\(?([^)]*)\)?$/;
    public static readonly exactVersionRegex: RegExp = /^(?:==)?\s*([\w\-.]+)$/;

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

    public static parsePyproject(pyprojectFile: string): ParsedPythonDescriptor | undefined {
        const pyproject: PyprojectToml = parseToml(fs.readFileSync(pyprojectFile, 'utf8')) as PyprojectToml;
        const poetry: PyprojectPoetryTable | undefined = pyproject.tool?.poetry;
        // A pyproject.toml that holds only tool configuration, such as [tool.ruff], declares no project to scan.
        if (!pyproject.project && !poetry) {
            return undefined;
        }
        // As in Poetry, [tool.poetry.dependencies] counts only when [project] lists no dependencies.
        const requirements: string[] | undefined = pyproject.project?.dependencies;
        const directDependencies: Map<string, string | undefined> =
            Array.isArray(requirements) && requirements.length > 0
                ? this.getProjectTableDependencies(requirements)
                : this.getPoetryTableDependencies(poetry);
        return { path: pyprojectFile, projectName: pyproject.project?.name || poetry?.name, directDependencies };
    }

    /** The standard [project] table (PEP 621) lists dependencies as requirement strings, such as 'requests[socks]>=2.0'. */
    private static getProjectTableDependencies(requirements: string[]): Map<string, string | undefined> {
        const dependencies: Map<string, string | undefined> = new Map<string, string | undefined>();
        for (const requirement of requirements) {
            // Drop the environment marker after ';', then split the name from its optional extras and version constraint.
            const [, name, constraint] = new RegExp(PypiUtils.requirementRegex).exec(requirement.split(';')[0].trim()) || [];
            if (name) {
                dependencies.set(name, this.toExactVersion(constraint));
            }
        }
        return dependencies;
    }

    /** Poetry before 2.0 declares dependencies in its own table, mapping each name to a constraint or to a table that holds one. */
    private static getPoetryTableDependencies(poetry: PyprojectPoetryTable | undefined): Map<string, string | undefined> {
        const dependencies: Map<string, string | undefined> = new Map<string, string | undefined>();
        for (const [name, constraint] of Object.entries(poetry?.dependencies || {})) {
            // Poetry declares the supported Python version as a dependency named 'python'.
            if (name !== 'python') {
                dependencies.set(name, this.toExactVersion(typeof constraint === 'string' ? constraint : constraint.version));
            }
        }
        return dependencies;
    }

    /** Only an exact pin can be compared against the installed version. It is written '==1.2.3', or '1.2.3' in Poetry. */
    private static toExactVersion(constraint: string | undefined): string {
        const [, exactVersion] = new RegExp(PypiUtils.exactVersionRegex).exec((constraint || '').trim()) || [];
        return exactVersion ? '==' + exactVersion : '';
    }

    /**
     * Python package names ignore case and treat runs of '-', '_' and '.' as equal (PEP 503).
     * @example normalizePackageName('Zope_Interface') === normalizePackageName('zope.interface') // both are 'zope-interface'
     */
    private static normalizePackageName(name: string): string {
        return name.toLowerCase().replace(/[-_.]+/g, '-');
    }

    private static matchPythonDependencies(rawDependencies: string): Map<string, string | undefined> {
        let dependencyMatch: RegExpExecArray | null;
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
     * @param workspace        - Base workspace folders
     * @param descriptors      - Paths to setup.py, pyproject.toml and requirements*.txt files
     * @param logManager       - LogManager for the operation
     * @param checkCanceled    - method to check if cancel
     * @param parent           - The base tree node
     */
    public static async createDependenciesTrees(
        descriptors: vscode.Uri[] | undefined,
        workspace: vscode.WorkspaceFolder,
        logManager: LogManager,
        checkCanceled: () => void,
        parent: DependenciesTreeNode
    ): Promise<void> {
        // Parse before resolving the interpreter, so that a workspace with nothing to scan gets no virtual environment errors.
        const parsedDescriptors: ParsedPythonDescriptor[] = this.parseDescriptors(descriptors || [], logManager);
        if (parsedDescriptors.length === 0) {
            logManager.logMessage('No setup.py, pyproject.toml or requirements.txt files to scan in workspaces.', 'DEBUG');
            return;
        }
        const pythonPath: string | undefined = await this.getPythonInterpreterPath(logManager);
        if (!pythonPath) {
            return;
        }
        if (!PypiUtils.isInVirtualEnv(pythonPath, logManager)) {
            logManager.logError(
                new Error(
                    'Please install and activate a virtual environment before running Xray scan. Then, install your Python project in that environment.'
                ),
                true
            );
            return;
        }
        const pipDepTree: PipDepTree[] | undefined = this.runPipDepTree(pythonPath, logManager);
        if (!pipDepTree) {
            return;
        }
        await this.descriptorsToDependencyTrees(parsedDescriptors, pipDepTree, checkCanceled, logManager, parent);
        this.workspaceToDependencyTree(workspace, pythonPath, pipDepTree, parent);
    }

    private static async getPythonInterpreterPath(logManager: LogManager) {
        const pythonExtension: vscode.Extension<any> | undefined = await PypiUtils.getAndActivatePythonExtension();
        if (!pythonExtension) {
            logManager.logError(
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
            logManager.logError(new Error('Could not scan python Python dependencies, because python interpreter is not set.'), true);
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
     * Parse the descriptors, skipping a pyproject.toml that declares no Python project or cannot be read.
     * @param descriptors - Paths to setup.py, pyproject.toml and requirements*.txt files
     * @param logManager  - LogManager for the operation
     */
    public static parseDescriptors(descriptors: vscode.Uri[], logManager: LogManager): ParsedPythonDescriptor[] {
        const parsedDescriptors: ParsedPythonDescriptor[] = [];
        for (const descriptor of descriptors) {
            const parsedDescriptor: ParsedPythonDescriptor | undefined = this.parseDescriptor(descriptor.fsPath, logManager);
            if (parsedDescriptor) {
                parsedDescriptors.push(parsedDescriptor);
            }
        }
        return parsedDescriptors;
    }

    private static parseDescriptor(descriptorPath: string, logManager: LogManager): ParsedPythonDescriptor | undefined {
        switch (path.basename(descriptorPath)) {
            case 'setup.py':
                return {
                    path: descriptorPath,
                    projectName: this.searchProjectName(descriptorPath),
                    directDependencies: this.getSetupPyDirectDependencies(descriptorPath)
                };
            case 'pyproject.toml':
                try {
                    return this.parsePyproject(descriptorPath);
                } catch (error) {
                    // One unreadable pyproject.toml must not stop the other descriptors of the workspace from being scanned.
                    logManager.logMessage(`Skipping '${descriptorPath}', failed to read it: ${(<any>error).message}`, 'WARN');
                    return undefined;
                }
            default:
                return { path: descriptorPath, directDependencies: this.getRequirementsTxtDirectDependencies(descriptorPath) };
        }
    }

    /**
     * Create a dependency tree for each descriptor based on its dependencies declaration.
     * @param parsedDescriptors - Descriptors parsed by parseDescriptors
     * @param pipDepTree - project dependency tree
     * @param parent - Parent of all the descriptors
     * @returns All descriptors dependency trees
     */
    public static async descriptorsToDependencyTrees(
        parsedDescriptors: ParsedPythonDescriptor[],
        pipDepTree: PipDepTree[],
        checkCanceled: () => void,
        logManager: LogManager,
        parent: DependenciesTreeNode
    ): Promise<PypiTreeNode[]> {
        // A descriptor that declares no project name, such as requirements.txt, uses the one declared by the workspace's
        // setup.py or pyproject.toml, because pip nests the dependencies of an installed project under that project.
        const workspaceProjectName: string | undefined = parsedDescriptors.find(parsedDescriptor => parsedDescriptor.projectName)?.projectName;
        const trees: PypiTreeNode[] = [];
        for (const parsedDescriptor of parsedDescriptors) {
            checkCanceled();
            logManager.logMessage(`Analyzing '${parsedDescriptor.path}' file`, 'INFO');
            let root: PypiTreeNode = new PypiTreeNode(parsedDescriptor.path, parent);
            root.refreshDependencies(
                this.filterDependencies(parsedDescriptor.directDependencies, pipDepTree, false, parsedDescriptor.projectName || workspaceProjectName)
            );
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
        parent: DependenciesTreeNode
    ) {
        let root: VirtualEnvPypiTree = new VirtualEnvPypiTree(virtualEnvPath, workspace.uri.fsPath, parent);
        root.refreshDependencies(pipDepTree);
        // In case there are more than one descriptor in the same workspace
        if (!parent.children.includes(root)) {
            parent.children.push(root);
        }
    }

    /**
     * Filters out dependencies that are not part of the descriptor.
     * @param dependencies The dependencies specified in the descriptor.
     * @param pipDepTree All dependencies obtained from pipDepTree command.
     * @param isSetupPy Indicates whether the descriptor is of type setup.py.
     * @param projectName The name of the project.
     * @returns Filtered list of PipDepTree representing direct dependencies.
     */
    public static filterDependencies(
        dependencies: Map<string, string | undefined>,
        pipDepTree: PipDepTree[],
        isSetupPy: boolean,
        projectName?: string
    ): PipDepTree[] {
        let directDependencies: PipDepTree[] = [];
        if (dependencies.size === 0) {
            return directDependencies;
        }
        // pip reports some installed names dotted ('ruamel.yaml') and others dashed ('zope-interface'), so names are compared normalized.
        const versionByName: Map<string, string | undefined> = new Map(
            [...dependencies].map(([name, version]) => [this.normalizePackageName(name), version])
        );
        for (const dep of pipDepTree) {
            const name: string = this.normalizePackageName(dep.key);
            if (projectName && name === this.normalizePackageName(projectName)) {
                // If a project name is provided, it resides at level 0 of the tree containing all its dependencies.
                directDependencies.push(...this.filterDependencies(dependencies, dep.dependencies, isSetupPy));
            }
            if (!versionByName.has(name)) {
                // Dependency is not a direct dependency.
                continue;
            }
            const version: string | undefined = versionByName.get(name);
            if (version && !this.isVersionsEqual(dep, version, isSetupPy)) {
                continue;
            }
            directDependencies.push(dep);
        }
        return directDependencies;
    }

    private static isVersionsEqual(dependencyFromPipDepTree: PipDepTree, depFromDescriptor: string, isSetupPy: boolean): boolean {
        if (isSetupPy) {
            return dependencyFromPipDepTree.required_version === depFromDescriptor;
        }
        return depFromDescriptor.endsWith(dependencyFromPipDepTree.installed_version);
    }

    public static getRequirementsTxtDirectDependencies(path: string): Map<string, string | undefined> {
        const content: string = fs.readFileSync(path, 'utf8');
        return this.matchPythonDependencies(content);
    }
}
