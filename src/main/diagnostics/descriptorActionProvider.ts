import * as vscode from 'vscode';
import { DependencyUpdateManager } from '../dependencyUpdate/dependencyUpdateManager';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { DependencyUtils } from '../treeDataProviders/utils/dependencyUtils';
import { PackageType } from '../types/projectType';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractFileActionProvider } from './abstractFileActionProvider';

/**
 * Describes the information calculated for a direct dependency with issues in a descriptor
 */
class DirectDependencyInfo {
    constructor(
        public severity: Severity,
        public range: vscode.Range[],
        public diagnosticIssues: Map<string, DirectDependencyIssue> = new Map<string, DirectDependencyIssue>()
    ) {}
}

interface DirectDependencyIssue {
    label: string;
    severity: Severity;
    infectedDependencies: string[];
}

/**
 * Describes an action provider for the descriptor files.
 * 1. Adds diagnostics to the file if it contains issues that was discovered in the scan
 * 2. Adds severity icon to the descriptor file in the places were the infected dependency exists
 */
export class DescriptorActionProvider extends AbstractFileActionProvider implements vscode.CodeActionProvider {
    public static readonly DESCRIPTOR_SELECTOR: vscode.DocumentSelector = {
        scheme: 'file',
        pattern: '**/{go.mod,package.json,pom.xml,*requirements*.txt,yarn.lock}'
    };

    private _processedMap: Map<vscode.Uri, Map<string, DirectDependencyInfo>> = new Map<vscode.Uri, Map<string, DirectDependencyInfo>>();

    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager, private updateManager: DependencyUpdateManager) {
        super(diagnosticCollection, treesManager);
    }

    /** @Override */
    public activate(context: vscode.ExtensionContext) {
        super.activate(context);
        context.subscriptions.push(
            this,
            vscode.languages.registerCodeActionsProvider(DescriptorActionProvider.DESCRIPTOR_SELECTOR, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.Empty]
            } as vscode.CodeActionProviderMetadata)
        );
    }

    /** @Override */
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
        const [dependency, dependencyChildren] = this.getDependencyAtCursor(document, range);
        return [...this.createJumpActions(dependencyChildren), ...this.createFixActions(dependency)];
    }

    private getDependencyAtCursor(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection
    ): [DependencyIssuesTreeNode?, Set<DependencyIssuesTreeNode>?] | [] {
        const [dependencyId, dependencyInfo] = this.getDependencyIdAtCursor(document, range);
        if (!dependencyId || !dependencyInfo) {
            return [];
        }
        return this.getDependencyById(document, dependencyId, dependencyInfo);
    }

    private getDependencyIdAtCursor(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): [string, DirectDependencyInfo] | [] {
        const dependencies: Map<string, DirectDependencyInfo> | undefined = this.getDescriptorDependencies(document.uri);
        if (!dependencies) {
            return [];
        }
        return this.getDependencyInRange(dependencies, range);
    }

    private getDependencyInRange(dependencies: Map<string, DirectDependencyInfo>, range: vscode.Range): [string, DirectDependencyInfo] | [] {
        for (let [id, info] of dependencies) {
            if (info.range.some(position => range.intersection(position))) {
                return [id, info];
            }
        }
        return [];
    }

    private getDependencyById(
        document: vscode.TextDocument,
        dependencyId: string,
        dependencyInfo: DirectDependencyInfo
    ): [DependencyIssuesTreeNode?, Set<DependencyIssuesTreeNode>?] | [] {
        const root: DescriptorTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getDescriptorTreeNode(document.uri.fsPath);
        if (!root) {
            return [];
        }
        return [root.getDependencyByID(dependencyId), this.createChildDependency(dependencyInfo, root)];
    }

    private getDescriptorDependencies(file: vscode.Uri) {
        return this._processedMap.get(file);
    }

    /**
     * Creates code actions in the editor that update a vulnerable dependency to its fixed version.
     * @param dependency - The vulnerable dependency.
     * @returns - Fixed versions that are available for updating.
     */
    private createFixActions(dependency: DependencyIssuesTreeNode | undefined): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        let previousCves: Set<string> = new Set<string>();

        if (!dependency) {
            return actions;
        }

        if (!this.availableUpdateManager(dependency)) {
            return actions;
        }

        dependency.getFixedVersionToCves().forEach((cves: Set<string>, fixedVersion: string) => {
            previousCves = new Set([...previousCves, ...cves]);
            actions.push(this.createFixAction(dependency, previousCves, fixedVersion));
        });

        return actions.reverse();
    }

    private availableUpdateManager(dependency: DependencyIssuesTreeNode): boolean {
        return this.updateManager.getUpdateManager(dependency) !== undefined;
    }

    private createFixAction(dependency: DependencyIssuesTreeNode, cves: Set<string>, fixedVersion: string): vscode.CodeAction {
        const action: vscode.CodeAction = new vscode.CodeAction(this.createFixActionMessage(fixedVersion, cves), vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'jfrog.issues.select.updateDependency',
            title: 'Update vulnerable dependency',
            tooltip: `This will update ${dependency.name} to version ${fixedVersion}.`,
            arguments: [dependency, fixedVersion]
        };
        return action;
    }

    private createFixActionMessage(fixedVersion: string, cves: Set<string>): string {
        let message: string = `Update to version ${fixedVersion} fixes the issue`;
        if (cves.size > 1) {
            message += 's';
        }
        message += `: ${cves.values().next().value}`;
        if (cves.size > 1) {
            message += ` and ${cves.size - 1} more.`;
        }
        return message;
    }

    private createJumpActions(infectedDependencies: Set<DependencyIssuesTreeNode> | undefined): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        if (!infectedDependencies) {
            return actions;
        }
        for (const infectedDependency of infectedDependencies) {
            const action: vscode.CodeAction = new vscode.CodeAction(
                "Show infected dependency '" + infectedDependency.componentId + "' in issues tree",
                vscode.CodeActionKind.Empty
            );
            action.command = {
                command: 'jfrog.issues.select.node',
                title: "Show infected dependency '" + infectedDependency.componentId + "' in issues tree",
                arguments: [infectedDependency]
            };
            actions.push(action);
        }
        return actions;
    }

    private createChildDependency(directDependencyInfo: DirectDependencyInfo, tree: DescriptorTreeNode): Set<DependencyIssuesTreeNode> {
        let infectedDependencies: Set<DependencyIssuesTreeNode> = new Set<DependencyIssuesTreeNode>();
        // Get all the infected dependencies for a direct dependency as a set
        for (const issueInfo of directDependencyInfo.diagnosticIssues.values()) {
            for (const infectedDependencyId of issueInfo.infectedDependencies) {
                let infectedDependency: DependencyIssuesTreeNode | undefined = tree.getDependencyByID(infectedDependencyId);
                if (infectedDependency) {
                    infectedDependencies.add(infectedDependency);
                }
            }
        }
        return infectedDependencies;
    }

    /** @Override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        // Search if the descriptor had issues in the scan
        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileIssues instanceof DescriptorTreeNode) {
            this._treesManager.logManager.logMessage("Creating diagnostics for descriptor '" + document.uri.fsPath + "'", 'DEBUG');
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
            let diagnostics: vscode.Diagnostic[] = [];
            let processedDependencies: Map<string, DirectDependencyInfo> = new Map<string, DirectDependencyInfo>();
            // Calculate the direct dependency information of each issue in the descriptor from the impact tree
            fileIssues.dependenciesWithIssue.forEach(dependencyWithIssue => {
                dependencyWithIssue.issues.forEach(issue => {
                    issue.impactedTree.children
                        ?.map(impact => impact.name)
                        .forEach(directDependencyId =>
                            this.handleIssueInDirectDependency(
                                issue,
                                directDependencyId,
                                dependencyWithIssue,
                                dependencyWithIssue.type,
                                processedDependencies,
                                document
                            )
                        );
                });
            });
            for (let directDependencyInfo of processedDependencies.values()) {
                // Add diagnostics to the direct dependency by the order of their severity
                for (const [issueId, info] of Array.from(directDependencyInfo.diagnosticIssues.entries()).sort(
                    (lhs, rhs) => rhs[1].severity - lhs[1].severity
                )) {
                    diagnostics.push(
                        ...this.createDiagnostics(
                            issueId,
                            `🐸 ${info.label} - Severity: ${SeverityUtils.getString(
                                info.severity
                            )}\nImpacted Components: ${info.infectedDependencies.join()}`,
                            vscode.DiagnosticSeverity.Warning,
                            ...directDependencyInfo.range
                        )
                    );
                }
                // Add gutter icons for top severity of the direct dependency
                this.addGutter(textEditor, SeverityUtils.getIcon(directDependencyInfo.severity), ...directDependencyInfo.range);
            }
            this._diagnosticCollection.set(document.uri, diagnostics);
            this._processedMap.set(document.uri, processedDependencies);
        }
    }

    /**
     * Calculate and update the direct dependency information base on a given issue
     * @param issue - the issue to add to the direct dependency
     * @param directDependencyId - the direct dependency id
     * @param dependencyWithIssue - the dependency with the issue
     * @param packageType  - the direct dependency package type
     * @param processedDependencies - the list of all the processed dependencies to search inside
     * @param document - the document that holds the dependency
     * @returns
     */
    private handleIssueInDirectDependency(
        issue: IssueTreeNode,
        directDependencyId: string,
        dependencyWithIssue: DependencyIssuesTreeNode,
        packageType: PackageType,
        processedDependencies: Map<string, DirectDependencyInfo>,
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
        // Add diagnostic for the issue if not exists already from different transitive dependency
        let issueLabel: string = issue.label ? issue.label.toString() : issue.issueId;
        let directDependencyIssue: DirectDependencyIssue | undefined = info.diagnosticIssues.get(issue.issueId);
        if (!directDependencyIssue) {
            info.diagnosticIssues.set(issue.issueId, {
                label: issueLabel,
                severity: issue.severity,
                infectedDependencies: [dependencyWithIssue.componentId]
            } as DirectDependencyIssue);
        } else if (!directDependencyIssue.infectedDependencies.includes(dependencyWithIssue.componentId)) {
            directDependencyIssue.infectedDependencies.push(dependencyWithIssue.componentId);
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
        let range: vscode.Range[] = DependencyUtils.getDependencyPosition(document, packageType, directDependencyId);
        if (range.length === 0) {
            return undefined;
        }
        let info: DirectDependencyInfo = new DirectDependencyInfo(Severity.NotApplicableUnknown, range);
        processedDependencies.set(directDependencyId, info);
        return info;
    }
}
