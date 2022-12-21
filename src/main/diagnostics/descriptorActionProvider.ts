import * as vscode from 'vscode';

import { CveTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { LicenseIssueTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/licenseIssueTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { DescriptorUtils } from '../treeDataProviders/utils/descriptorUtils';
import { PackageType } from '../types/projectType';
import { SeverityUtils } from '../types/severity';
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
                    if (issue instanceof CveTreeNode || issue instanceof LicenseIssueTreeNode) {
                        issue.impactedTree?.children
                            ?.map(impact => impact.name)
                            .forEach(directDependencyId => {
                                let directDependencyName: string = directDependencyId.substring(0, directDependencyId.lastIndexOf(':'));
                                if (dependencyWithIssue.type == PackageType.Maven) {
                                    directDependencyName = directDependencyId;
                                }
                                if (proceesedDependencies.has(directDependencyName)) {
                                    return;
                                }
                                proceesedDependencies.add(directDependencyName);
                                let position: vscode.Position[] = DescriptorUtils.getDependencyPosition(
                                    document,
                                    dependencyWithIssue.type,
                                    directDependencyName
                                );
                                if (position.length === 0) {
                                    return;
                                }
                                this._treesManager.logManager.logMessage(
                                    "Creating diagnostics for dependency '" + directDependencyName + "'",
                                    'DEBUG'
                                );
                                // Create diagnostics and gutter icon for the dependency
                                diagnostics.push(
                                    ...this.createDiagnostics(
                                        directDependencyName,
                                        'Top issue severity: ' + SeverityUtils.getString(dependencyWithIssue.topSeverity),
                                        position
                                    )
                                );
                                this.addGutter(textEditor, SeverityUtils.getIcon(dependencyWithIssue.topSeverity), position);
                            });
                    }
                });
            });
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }
}
