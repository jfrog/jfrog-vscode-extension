import * as vscode from 'vscode';

// import { CveTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
// import { LicenseIssueTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/licenseIssueTreeNode';
// import { LicenseIssueTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/licenseIssueTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { DescriptorUtils } from '../treeDataProviders/utils/descriptorUtils';
import { PackageType } from '../types/projectType';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractFileActionProvider } from './abstractFileActionProvider';

/**
 * Describes an action provider for the descriptor files.
 * 1. Adds diagnostics to the file if it contains issues that was discover in the scan
 * 2. Adds severity icon to the descriptor file in the places were the infected dependency exists
 */
export class DescriptorActionProvider extends AbstractFileActionProvider {
    /** @Override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        // Search if the descriptor had issues in the scan
        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileIssues instanceof DescriptorTreeNode) {
            this._treesManager.logManager.logMessage("Creating diagnostics for document '" + document.uri.fsPath + "'", 'DEBUG');
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
            let diagnostics: vscode.Diagnostic[] = [];
            let proceesedDependencies: Set<string> = new Set<string>();
            // Get the direct dependency of each issue in the descriptor from the impact tree
            fileIssues.dependenciesWithIssue.forEach(dependencyWithIssue => {
                dependencyWithIssue.issues.forEach(issue => {
                    issue.impactedTree?.children
                        ?.map(impact => impact.name)
                        .forEach(directDependencyId => {
                            if (proceesedDependencies.has(directDependencyId)) {
                                // Direct dependency already had a diffrent dependency with issue that generated information for it
                                return;
                            }
                            // Create diagnostics for the dependency
                            proceesedDependencies.add(directDependencyId);
                            this.generateInformation(
                                directDependencyId,
                                dependencyWithIssue.type,
                                dependencyWithIssue.severity,
                                document,
                                textEditor,
                                diagnostics
                            );
                        });
                });
            });
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }

    private generateInformation(
        directDependencyId: string,
        packgeType: PackageType,
        severity: Severity,
        document: vscode.TextDocument,
        textEditor: vscode.TextEditor,
        diagnostics: vscode.Diagnostic[]
    ) {
        let position: vscode.Position[] = DescriptorUtils.getDependencyPosition(document, packgeType, directDependencyId);
        if (position.length === 0) {
            return;
        }
        this._treesManager.logManager.logMessage("Creating diagnostics for dependency '" + directDependencyId + "'", 'DEBUG');
        // Create diagnostics and gutter icon for the dependency
        diagnostics.push(...this.createDiagnostics(directDependencyId, 'Top issue severity: ' + SeverityUtils.getString(severity), position));
        this.addGutter(textEditor, SeverityUtils.getIcon(severity), position);
    }
}
