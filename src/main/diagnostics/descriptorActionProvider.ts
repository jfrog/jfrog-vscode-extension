// import { doc } from 'prettier';
import * as vscode from 'vscode';
import { FocusType } from '../focus/abstractFocus';
// import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssueTreeNode';
import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
// import { TreesManager } from '../treeDataProviders/treesManager';
import { PackageType } from '../types/projectType';
import { SeverityUtils } from '../types/severity';
import { GoUtils } from '../utils/goUtils';
import { MavenUtils } from '../utils/mavenUtils';
import { NpmUtils } from '../utils/npmUtils';
import { PypiUtils } from '../utils/pypiUtils';
import { YarnUtils } from '../utils/yarnUtils';
// import { MavenUtils } from '../utils/mavenUtils';
import { AbstractFileActionProvider } from './abstractFileActionProvider';

export class DescriptorActionProvider extends AbstractFileActionProvider {

    // private readonly GIT: string = ".git";

    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        let documentPath: string = document.uri.fsPath; // TODO: document.uri.fsPath.endsWith(this.GIT) ? document.uri.fsPath.substring(0,document.uri.fsPath.indexOf(this.GIT)): document.uri.fsPath;

        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(documentPath);
        if(fileIssues instanceof DescriptorTreeNode) {
            this._treesManager.logManager.logMessage("<ASSAFA> creating diagnostics for document '" + documentPath + "'", 'DEBUG');
            // Add gutters to dependencies with issues
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
            let diagnostics: vscode.Diagnostic[] = [];

            fileIssues.dependenciesWithIssue.forEach(dependencyWithIssue => {
                dependencyWithIssue.impactedTree?.children?.map(impact => impact.name/*.substring(0,impact.name.lastIndexOf(":"))*/).forEach(directDependencyName => {
                    let position: vscode.Position[] = this.getDependencyPosition(documentPath, document,dependencyWithIssue.type,directDependencyName);
                    if (position.length === 0) {
                        this._treesManager.logManager.logMessage("<ASSAFA> can't find positions for dependency '" + directDependencyName + "'", 'DEBUG');
                        return;
                    }

                    this._treesManager.logManager.logMessage("<ASSAFA> creating diagnostics for dependency '" + directDependencyName + "' (position.length = " + position.length + ")", 'DEBUG');
                    diagnostics.push(...this.createDiagnostics(directDependencyName,'Top issue severity: ' + SeverityUtils.getString(dependencyWithIssue.topSeverity),position));
                    this.addGutter(textEditor, SeverityUtils.getIcon(dependencyWithIssue.topSeverity), position);
                })
                
            });
            
            this._diagnosticCollection.set(document.uri, diagnostics);
        } else {
            this._treesManager.logManager.logMessage("<ASSAFA> no descritor issues for document '" + documentPath + "'", 'DEBUG');
        }
    }

    private getDependencyPosition(documentPath: string, document: vscode.TextDocument, packeType: PackageType , dependencyId: string): vscode.Position[] {

        let searchParameter: string = dependencyId.substring(0,dependencyId.lastIndexOf(":"));
        if (packeType == PackageType.Maven) {
            searchParameter = dependencyId;
        }

        switch(packeType) {
            case PackageType.Go: return GoUtils.getDependencyPosition(document,searchParameter,FocusType.Dependency);
            case PackageType.Maven: return MavenUtils.getDependencyPos(document,undefined,FocusType.Dependency); // TODO: FIX THIS
            case PackageType.Npm: return NpmUtils.getDependencyPosition(document,searchParameter,FocusType.Dependency);
            case PackageType.Python: return PypiUtils.getDependencyPosition(document,searchParameter);
            case PackageType.Yarn: return YarnUtils.getDependencyPosition(document,searchParameter);
            default:
                this._treesManager.logManager.logMessage("<ASSAFA> no positions for dependency '"+dependencyId+"' in descritor '" + documentPath + "'", 'DEBUG');
                return [];
        }
    }

    
}
