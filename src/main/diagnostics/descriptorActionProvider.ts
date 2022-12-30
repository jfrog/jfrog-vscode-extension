import * as vscode from 'vscode';

import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { DescriptorUtils } from '../treeDataProviders/utils/descriptorUtils';
import { PackageType } from '../types/projectType';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractFileActionProvider } from './abstractFileActionProvider';

/**
 * Describes the information caclulated for a direct dependency with issues in a descriptor
 */
class DirectDependencyInfo {
    constructor(public severity: Severity, public positions: vscode.Position[], public diagnostics: vscode.Diagnostic[] = []) {}
}

/**
 * Describes an action provider for the descriptor files.
 * 1. Adds diagnostics to the file if it contains issues that was discovered in the scan
 * 2. Adds severity icon to the descriptor file in the places were the infected dependency exists
 */
export class DescriptorActionProvider extends AbstractFileActionProvider {
    /** @Override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        // Search if the descriptor had issues in the scan
        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileIssues instanceof DescriptorTreeNode) {
            this._treesManager.logManager.logMessage("Creating diagnostics for descriptor '" + document.uri.fsPath + "'", 'DEBUG');
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
            let diagnostics: vscode.Diagnostic[] = [];
            let processedDependencies: Map<string, DirectDependencyInfo> = new Map<string, DirectDependencyInfo>();
            // Get the direct dependency of each issue in the descriptor from the impact tree
            fileIssues.dependenciesWithIssue.forEach(dependencyWithIssue => {
                dependencyWithIssue.issues.forEach(issue => {
                    issue.impactedTree?.children
                        ?.map(impact => impact.name)
                        .forEach(directDependencyId =>
                            this.handleIssueInDirectDependencyDiagnostic(
                                issue,
                                directDependencyId,
                                dependencyWithIssue.type,
                                processedDependencies,
                                diagnostics,
                                document
                            )
                        );
                });
            });
            // Add gutter icons for top severity and set diagnostics in collection
            for (let directDependncyInfo of processedDependencies.values()) {
                this.addGutter(textEditor, SeverityUtils.getIcon(directDependncyInfo.severity), directDependncyInfo.positions);
            }
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }

    /**
     * Create diagnostics for issue if not exists for a dependency
     * @param issue - the issue to create diagnostics for
     * @param directDependencyId  - the direct dependency id to create diagnostics for
     * @param packageType - the direct dependency package type
     * @param processedDependencies - the list of all the processed dependecies to search inside
     * @param diagnostics - list of all the diagnostics of the document
     * @param document - the document that holds the dependency
     */
    private handleIssueInDirectDependencyDiagnostic(
        issue: IssueTreeNode,
        directDependencyId: string,
        packageType: PackageType,
        processedDependencies: Map<string, DirectDependencyInfo>,
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument
    ) {
        // Get/create the information
        let info: DirectDependencyInfo | undefined = this.getOrCreateDirectDependencyInfo(
            directDependencyId,
            packageType,
            processedDependencies,
            document
        );
        if (!info) {
            return;
        }
        // Make sure to calculate top severity from all the issues in the direct dependency
        if (info.severity < issue.severity) {
            info.severity = issue.severity;
        }
        // Add diagnostic for the issue if not exists already from diffrent transetive dependency
        let issueDiagnostics: vscode.Diagnostic | undefined = info.diagnostics.find(diagnostic => diagnostic.code === issue.label);
        if (!issueDiagnostics) {
            // Create diagnostics for the issue in the dependency
            let newDiagnostics: vscode.Diagnostic[] = this.createDiagnostics(
                issue.label ? issue.label.toString() : issue.issueId,
                'Severity: ' + SeverityUtils.getString(issue.severity),
                info.positions
            );
            info.diagnostics.push(...newDiagnostics);
            diagnostics.push(...newDiagnostics);
        }
    }

    /**
     * Get or create if not exists the direct dependency aggregated information
     * @param directDependencyId - the id of the dependency
     * @param packageType - the package type of the dependency
     * @param processedDependencies - the list of all the processed dependencies to search inside
     * @param document - the document that holds the dependency
     * @returns dependency information
     */
    private getOrCreateDirectDependencyInfo(
        directDependencyId: string,
        packageType: PackageType,
        processedDependencies: Map<string, DirectDependencyInfo>,
        document: vscode.TextDocument
    ): DirectDependencyInfo | undefined {
        let potential: DirectDependencyInfo | undefined = processedDependencies.get(directDependencyId);
        if (potential) {
            return potential;
        }
        let position: vscode.Position[] = DescriptorUtils.getDependencyPosition(document, packageType, directDependencyId);
        if (position.length === 0) {
            return undefined;
        }
        let info: DirectDependencyInfo = new DirectDependencyInfo(Severity.Unknown, position);
        processedDependencies.set(directDependencyId, info);
        return info;
    }
}
