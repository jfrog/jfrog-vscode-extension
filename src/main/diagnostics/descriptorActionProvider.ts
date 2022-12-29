import * as vscode from 'vscode';

import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { DescriptorUtils } from '../treeDataProviders/utils/descriptorUtils';
import { PackageType } from '../types/projectType';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractFileActionProvider } from './abstractFileActionProvider';

class InfoPair {
    constructor(public severity: Severity, public positions: vscode.Position[], public diagnostics: vscode.Diagnostic[] = []) {}
}

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
            this._treesManager.logManager.logMessage("Creating diagnostics for descriptor '" + document.uri.fsPath + "'", 'DEBUG');
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
            let diagnostics: vscode.Diagnostic[] = [];
            let proceesedDependencies: Map<string, InfoPair> = new Map<string, InfoPair>();
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
                                proceesedDependencies,
                                diagnostics,
                                document
                            )
                        );
                });
            });
            // Add gutter icons for top severity and set diagnostics in collection
            Array.from(proceesedDependencies.values()).forEach(info => {
                this.addGutter(textEditor, SeverityUtils.getIcon(info.severity), info.positions);
            });
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }

    /**
     * Create diagnostics for issue if not exists for a dependency
     * @param issue - the issue to create diagnosics for
     * @param directDependencyId  - the direct dependency id to create diagnosics for
     * @param packgeType - the direct dependency packge type
     * @param proceesedDependencies - the list of all the processed dependecies to search inside
     * @param diagnostics - list of all the diagnostics of the document
     * @param document - the document that holds the dependency
     */
    private handleIssueInDirectDependencyDiagnostic(
        issue: IssueTreeNode,
        directDependencyId: string,
        packgeType: PackageType,
        proceesedDependencies: Map<string, InfoPair>,
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument
    ) {
        // Get/create the information
        let info: InfoPair | undefined = this.getOrCreateDirectDependencyInfo(directDependencyId, packgeType, proceesedDependencies, document);
        if (!info) {
            return;
        }
        // Make sure to caclulate top severity from all the issues in the direct depndency
        if (info.severity < issue.severity) {
            info.severity = issue.severity;
        }
        // Add diagnostic for the issue if not exists already from diffrent transetive dependency
        let issueDiagnostics: vscode.Diagnostic | undefined = info.diagnostics.find(diagnostic => diagnostic.code == issue.label);
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
     * Get or create if not eixsts the dependency information
     * @param directDependencyId - the id of the dependency
     * @param packgeType - the packge type of the dependency
     * @param proceesedDependencies - the list of all the processed dependecies to search inside
     * @param document - the document that holds the dependency
     * @returns dependency information
     */
    private getOrCreateDirectDependencyInfo(
        directDependencyId: string,
        packgeType: PackageType,
        proceesedDependencies: Map<string, InfoPair>,
        document: vscode.TextDocument
    ): InfoPair | undefined {
        let potential: InfoPair | undefined = proceesedDependencies.get(directDependencyId);
        if (potential) {
            return potential;
        }
        let position: vscode.Position[] = DescriptorUtils.getDependencyPosition(document, packgeType, directDependencyId);
        if (position.length === 0) {
            return undefined;
        }
        let info: InfoPair = new InfoPair(Severity.Unknown, position);
        proceesedDependencies.set(directDependencyId, info);
        return info;
    }
}
