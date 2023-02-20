import { NugetDepsTree } from 'nuget-deps-tree';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { NugetTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/nugetTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Utils } from '../treeDataProviders/utils/utils';

export class NugetUtils {
    public static readonly SOLUTION_SUFFIX: string = '.sln';
    public static readonly PROJECT_SUFFIX: string = '.csproj';
    public static readonly PACKAGES_CONFIG: string = 'packages.config';

    /**
     * @param solutionsAndProjects        - Paths to *.sln files
     * @param componentsToScan - Set of nuget components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - Scan trees manager
     * @param parent           - The base tree node
     * @returns - the paths to the project files and failed solution files
     */
    public static async createDependenciesTrees(
        solutionsAndProjects: vscode.Uri[] | undefined,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        checkCanceled: () => void
    ): Promise<void> {
        let solutions: vscode.Uri[] | undefined = this.filterSolutions(solutionsAndProjects);
        if (!solutions) {
            treesManager.logManager.logMessage('No *.sln files found in workspaces.', 'DEBUG');
            return;
        }
        treesManager.logManager.logMessage('Solution files to scan: [' + solutions.toString() + ']', 'DEBUG');
        for (let solution of solutions) {
            checkCanceled();
            let projectsInSolutions: vscode.Uri[] | undefined = this.filterProjects(solutionsAndProjects, solution);
            let tree: any = await NugetUtils.getProjects(solution, projectsInSolutions, treesManager.logManager);
            if (!tree) {
                // We show sln files only if we have error
                this.createSolutionNode(parent, solution.fsPath, true);
                continue;
            }
            for (let project of tree.projects) {
                checkCanceled();
                let projectUri: vscode.Uri | undefined = this.getProjectUri(project.name, projectsInSolutions);
                if (projectUri) {
                    let configUri: vscode.Uri = this.getPackagesConfigUri(projectUri) || projectUri;
                    this.createProjectNode(parent, configUri, project);
                }
            }
        }
    }

    private static getPackagesConfigUri(projectUri: vscode.Uri): vscode.Uri | undefined {
        let projectDir: string = path.dirname(projectUri.fsPath);
        let potentialUri: vscode.Uri = vscode.Uri.parse(path.join(projectDir, NugetUtils.PACKAGES_CONFIG));
        return fs.existsSync(potentialUri.fsPath) ? potentialUri : undefined;
    }

    private static createProjectNode(parent: DependenciesTreeNode, projectUri: vscode.Uri, project: any) {
        let projectNode: NugetTreeNode = new NugetTreeNode(projectUri.fsPath, parent);
        projectNode.refreshDependencies(project);
    }

    private static createSolutionNode(parent: DependenciesTreeNode, descriptorPath: string, failed: boolean = false): NugetTreeNode {
        let solution: NugetTreeNode = new NugetTreeNode(descriptorPath, parent);
        solution.setName(Utils.getLastSegment(descriptorPath) + (failed ? ' [Not installed]' : ''));
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
                `Failed to scan NuGet project. Hint: Please make sure the commands 'dotnet restore' or 'nuget restore' run successfully for '${solution.fsPath}'`,
                'ERR'
            );
            return null;
        }

        return nugetList;
    }

    public static getDependencyPosition(document: vscode.TextDocument, artifactId: string): vscode.Range[] {
        let res: vscode.Range[] = [];
        let projectContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = projectContent.match(
            document.uri.fsPath.endsWith(NugetUtils.PACKAGES_CONFIG)
                ? this.getPackageConfigFileRegex(artifactId)
                : this.getCSProjFileRegex(artifactId)
        );
        if (!dependencyMatch) {
            return res;
        }
        let startPos: vscode.Position = document.positionAt(<number>dependencyMatch.index);
        res.push(new vscode.Range(startPos, new vscode.Position(startPos.line, startPos.character + dependencyMatch[0].length)));
        return res;
    }

    private static getPackageConfigFileRegex(artifactId: string): RegExp {
        let [artifactName, artifactVersion] = artifactId.split(':');
        artifactVersion = artifactVersion.replace(/\./g, '\\.');
        return new RegExp('<package\\s+id=\\"' + artifactName + '\\"\\s+version=\\"' + artifactVersion + '\\".*>', 'i');
    }

    private static getCSProjFileRegex(artifactId: string): RegExp {
        let [artifactName, artifactVersion] = artifactId.split(':');
        artifactVersion = artifactVersion.replace(/\./g, '\\.');
        return new RegExp(`<PackageReference\\s+Include=\\"` + artifactName + '\\"(\\s+Version=\\"' + artifactVersion + '\\")?.*>', 'i');
    }
}
