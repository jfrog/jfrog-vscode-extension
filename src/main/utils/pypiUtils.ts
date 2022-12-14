import * as exec from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { PypiTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/pypiTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ProjectDetails } from '../types/projectDetails';
import { Configuration } from './configuration';
import { ScanUtils } from './scanUtils';

export class PypiUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/*requirements*.txt' };
    public static readonly PYTHON_SCRIPTS: string = path.join(ScanUtils.RESOURCES_DIR, 'python');
    public static readonly PIP_DEP_TREE_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'pipDepTree.py');
    public static readonly CHECK_VENV_SCRIPT: string = path.join(PypiUtils.PYTHON_SCRIPTS, 'checkVenv.py');
    public static readonly PKG_TYPE: string = 'pypi';

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
     * @param requirementsContent  - requirements file content - For optimization
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPos(
        document: vscode.TextDocument,
        requirementsContent: string,
        dependenciesTreeNode: DependenciesTreeNode
    ): vscode.Position[] {
        // return this.getDependencyPosition(document,dependenciesTreeNode.generalInfo.artifactId);
        let res: vscode.Position[] = [];
        let dependencyMatch: RegExpMatchArray | null = requirementsContent.match(dependenciesTreeNode.generalInfo.artifactId);
        if (!dependencyMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependencyMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependencyMatch[0].length));
        return res;
    }

    /**
     * Get requirements file and dependencies tree node. return the position of the dependency in the requirements file.
     * @param document             - requirements file
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPosition(document: vscode.TextDocument, artifactId: string): vscode.Position[] {
        let requirementsContent: string = document.getText().toLowerCase();
        let res: vscode.Position[] = [];
        let dependencyMatch: RegExpMatchArray | null = requirementsContent.match(artifactId);
        if (!dependencyMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependencyMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependencyMatch[0].length));
        return res;
    }

    /**
     * Find *.py files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param logManager       - Log manager
     */
    public static async arePythonFilesExist(workspaceFolder: vscode.WorkspaceFolder, logManager: LogManager): Promise<boolean> {
        logManager.logMessage('Locating python files in workspace "' + workspaceFolder.name + '".', 'INFO');

        let wsPythonFiles: vscode.Uri[] = await vscode.workspace.findFiles(
            { baseUri: workspaceFolder.uri, base: workspaceFolder.uri.fsPath, pattern: '**/*{setup.py,requirements*.txt}' },
            Configuration.getScanExcludePattern(workspaceFolder)
        );
        if (logManager && wsPythonFiles.length > 0) {
            logManager.logMessage('Detected python files in workspace ' + workspaceFolder.name + ': [' + wsPythonFiles.toString() + ']', 'DEBUG');
        }
        return Promise.resolve(wsPythonFiles.length > 0);
    }

    /**
     * @param pythonFiles      - Paths to setup.py and requirements*.txt files
     * @param workspaceFolders - Base workspace folders
     * @param componentsToScan - Set of setup.py components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - Scan trees manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        pythonFiles: vscode.Uri[] | undefined,
        workspaceFolders: vscode.WorkspaceFolder[],
        projectsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<void> {
        if (!pythonFiles) {
            treesManager.logManager.logMessage('No setup.py and requirements files found in workspaces.', 'DEBUG');
            return;
        }
        let pythonExtension: vscode.Extension<any> | undefined;
        for (let workspaceFolder of workspaceFolders) {
            let pythonFilesExist: boolean = await PypiUtils.arePythonFilesExist(workspaceFolder, treesManager.logManager);
            if (!pythonFilesExist) {
                treesManager.logManager.logMessage('No setup.py and requirements files found in workspace ' + workspaceFolder.name + '.', 'DEBUG');
                continue;
            }
            if (!pythonExtension) {
                pythonExtension = await PypiUtils.getAndActivatePythonExtension();
                if (!pythonExtension) {
                    treesManager.logManager.logError(
                        new Error(
                            'Could not scan Pypi project dependencies, because python extension is not installed. ' +
                                'Please install Python extension: https://marketplace.visualstudio.com/items?itemName=ms-python.python'
                        ),
                        !quickScan
                    );
                    return;
                }
            }

            let pythonPath: string | undefined = PypiUtils.getPythonPath(pythonExtension, workspaceFolder);
            if (!pythonPath) {
                treesManager.logManager.logError(
                    new Error('Could not scan Pypi project dependencies, because python interpreter is not set.'),
                    !quickScan
                );
                return;
            }
            if (!PypiUtils.isInVirtualEnv(pythonPath, workspaceFolder.uri.fsPath, treesManager.logManager)) {
                treesManager.logManager.logError(
                    new Error(
                        'Please install and activate a virtual environment before running Xray scan. Then, install your Python project in that environment.'
                    ),
                    !quickScan
                );
                return;
            }

            treesManager.logManager.logMessage('Analyzing setup.py and requirements files of ' + workspaceFolder.name, 'INFO');
            let root: PypiTreeNode = new PypiTreeNode(path.dirname(workspaceFolder.uri.fsPath), treesManager, pythonPath, parent);
            root.refreshDependencies(quickScan);
            projectsToScan.push(root.projectDetails);
        }
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
     * @param workspaceFolder - Base workspace folder
     */
    private static getPythonPath(pythonExtension: vscode.Extension<any>, workspaceFolder: vscode.WorkspaceFolder): string | undefined {
        let executionDetails: any = pythonExtension?.exports.settings.getExecutionDetails(workspaceFolder.uri);
        let execCommand: string[] | undefined = executionDetails?.execCommand;
        return execCommand ? execCommand[0] : undefined;
    }

    /**
     * Return true iff the input Python interpreter is inside virtual environment.
     * @param pythonPath      - Path to python interpreter
     * @param workspaceFolder - Base workspace folder
     */
    public static isInVirtualEnv(pythonPath: string, workspaceFolder: string, logManager: LogManager): boolean {
        try {
            exec.execSync(pythonPath + ' ' + PypiUtils.CHECK_VENV_SCRIPT, { cwd: workspaceFolder } as exec.ExecSyncOptionsWithStringEncoding);
            return true;
        } catch (error) {
            logManager.logError(<any>error, false);
            return false;
        }
    }

    /**
     * Search for requirements files in the input path.
     * @param fsPath - The base path to search
     */
    public static async getRequirementsFiles(fsPath: string): Promise<vscode.Uri[]> {
        return await vscode.workspace.findFiles(
            { baseUri: vscode.Uri.file(fsPath), base: fsPath, pattern: '**/*requirements*.txt' },
            Configuration.getScanExcludePattern()
        );
    }
}
