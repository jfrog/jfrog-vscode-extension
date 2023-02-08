import { NugetDepsTree } from 'nuget-deps-tree';
import * as path from 'path';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { NugetTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/nugetTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Utils } from '../treeDataProviders/utils/utils';
import { ProjectDetails } from '../types/projectDetails';

export class NugetUtils {
    public static readonly SOLUTION_SUFFIX: string = '.sln';
    public static readonly PROJECT_SUFFIX: string = '.csproj';

    /**
     * @param solutionsAndProjects        - Paths to *.sln files
     * @param componentsToScan - Set of nuget components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - Scan trees manager
     * @param parent           - The base tree node
     * @returns - the paths to the project files and failed solution files
     */
    public static async createDependenciesTrees(
        solutionsAndProjects: vscode.Uri[] | undefined,
        componentsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        checkCanceled: () => void
    ): Promise<vscode.Uri[]> {
        let solutions: vscode.Uri[] | undefined = this.filterSolutions(solutionsAndProjects);
        if (!solutions) {
            treesManager.logManager.logMessage('No *.sln files found in workspaces.', 'DEBUG');
            return [];
        }
        treesManager.logManager.logMessage('Solution files to scan: [' + solutions.toString() + ']', 'DEBUG');
        let updatedDescriptorList: vscode.Uri[] = [];
        for (let solution of solutions) {
            checkCanceled();
            let solutionDir: string = path.dirname(solution.fsPath);
            let solutionName: string = Utils.getLastSegment(solution.fsPath);
            let projectsInSolutions: vscode.Uri[] | undefined = this.filterProjects(solutionsAndProjects, solution);
            let tree: any = await NugetUtils.getProjects(solution, projectsInSolutions, treesManager.logManager);
            if (!tree) {
                // We show sln files only if we have error
                this.createSolutionNode(parent, solutionName, solutionDir, true);
                updatedDescriptorList.push(solution);
                continue;
            }
            let root: NugetTreeNode = this.createSolutionNode(parent, solutionName, solutionDir);
            for (let project of tree.projects) {
                checkCanceled();
                let projectUri: vscode.Uri | undefined = this.getProjectUri(project.name, projectsInSolutions);
                if (projectUri) {
                    this.createProjectNode(root, projectUri, project);
                    // We show project files as descriptors
                    updatedDescriptorList.push(projectUri);
                }
            }
        }
        return updatedDescriptorList;
    }

    private static createProjectNode(solution: NugetTreeNode, projectUri: vscode.Uri, project: any) {
        let projectNode: NugetTreeNode = new NugetTreeNode(path.dirname(projectUri.fsPath), solution);
        projectNode.refreshDependencies(project);
    }

    private static createSolutionNode(
        parent: DependenciesTreeNode,
        solutionName: string,
        solutionDir: string,
        failed: boolean = false
    ): NugetTreeNode {
        let solution: NugetTreeNode = new NugetTreeNode(solutionDir, parent);
        solution.setName(solutionName + (failed ? ' [Not installed]' : ''));
        return solution;
    }

    private static getProjectUri(projectName: string, solutionsAndProjects: vscode.Uri[] | undefined): vscode.Uri | undefined {
        return solutionsAndProjects?.find(optional => optional.fsPath.includes(projectName));
    }

    public static filterProjects(solutionsAndProjects: vscode.Uri[] | undefined, inSolution?: vscode.Uri): vscode.Uri[] | undefined {
        let projects: vscode.Uri[] | undefined = solutionsAndProjects?.filter(optional => optional.fsPath.endsWith(NugetUtils.PROJECT_SUFFIX));
        if (!inSolution || !projects) {
            return projects;
        }
        let solutionDir: string = path.dirname(inSolution.fsPath);
        return projects.filter(optional => optional.fsPath.includes(solutionDir));
    }

    public static filterSolutions(solutionsAndProjects: vscode.Uri[] | undefined): vscode.Uri[] | undefined {
        return solutionsAndProjects?.filter(optional => optional.fsPath.endsWith(NugetUtils.SOLUTION_SUFFIX));
    }

    /**
     * Get the projects tree for the provided solution file. Solution has to be pre restored.
     * @param slnFilePath - Path to solution
     * @param logManager  - Log manager
     * @param quickScan   - True to allow using the scan cache
     */
    private static async getProjects(solution: vscode.Uri, projectsInSolutions: vscode.Uri[] | undefined, logManager: LogManager): Promise<any> {
        let nugetList: any;
        try {
            nugetList = NugetDepsTree.generate(solution.fsPath);
        } catch (error) {
            logManager.logError(<any>error, true);
            logManager.logMessage('Failed building tree for solution "' + solution.fsPath + '", due to the above error.', 'ERR');
            return null;
        }

        if (!nugetList.projects || (projectsInSolutions && projectsInSolutions.length !== nugetList.projects.length)) {
            logManager.logError(new Error('No projects found for solution "' + solution.fsPath + '".'), true);
            logManager.logMessageAndToastErr(
                `Failed to scan nuget project. Hint: Please make sure the commands 'dotnet restore' or 'nuget restore' run successfully for '${solution.fsPath}'`,
                'ERR'
            );
            return null;
        }

        return nugetList;
    }

    // /**
    //  * Get package.json file and return the position of 'dependencies' section.
    //  * @param document - package.json file
    //  */
    // public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
    //     let res: vscode.Position[] = [];
    //     let packageJsonContent: string = document.getText();
    //     let dependenciesMatch: RegExpMatchArray | null = packageJsonContent.match('"((devD)|(d))ependencies"s*:s*');
    //     if (!dependenciesMatch) {
    //         return res;
    //     }
    //     res.push(document.positionAt(<number>dependenciesMatch.index));
    //     res.push(new vscode.Position(res[0].line, res[0].character + dependenciesMatch[0].length));
    //     return res;
    // }

    // // public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {

    // // }

    // /**
    //  * Get package.json file and dependencies tree node. return the position of the dependency in the package.json file.
    //  * @param document             - package.json file
    //  * @param dependenciesTreeNode - dependencies tree node
    //  */
    // public static getDependencyPosition(document: vscode.TextDocument, artifactId: string, focusType: FocusType): vscode.Range[] {
    //     let res: vscode.Range[] = [];
    //     let packageJsonContent: string = document.getText();
    //     let dependencyMatch: RegExpMatchArray | null = packageJsonContent.match('("' + artifactId + '"\\s*:\\s*).*"');
    //     if (!dependencyMatch) {
    //         return res;
    //     }
    //     let startPos: vscode.Position;
    //     switch (focusType) {
    //         case FocusType.Dependency:
    //             startPos = document.positionAt(<number>dependencyMatch.index);
    //             break;
    //         case FocusType.DependencyVersion:
    //             startPos = document.positionAt(<number>dependencyMatch.index + dependencyMatch[1].length);
    //             break;
    //     }
    //     res.push(new vscode.Range(startPos, new vscode.Position(startPos.line, startPos.character + dependencyMatch[0].length)));
    //     return res;
    // }
}
