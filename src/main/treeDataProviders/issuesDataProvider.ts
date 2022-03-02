import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { Severity, SeverityUtils } from '../types/severity';
import { Consts } from '../utils/consts';
import { IconsPaths } from '../utils/iconsPaths';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';

/**
 * The component issues details tree.
 */
export class IssuesDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;
    private _selectedNode: DependenciesTreeNode | undefined;

    constructor(protected _scanCacheManager: ScanCacheManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        if (!(element instanceof TreeDataHolder)) {
            // VulnerabilityNode, ViolatedLicenseNode, LicensesTitleNode, or VulnerabilitiesTitleNode
            return element;
        }

        // License components or vulnerability details
        let holder: TreeDataHolder = <TreeDataHolder>element;
        let treeItem: vscode.TreeItem = new vscode.TreeItem(holder.key);
        treeItem.description = holder.value;
        if (holder.link) {
            treeItem.command = {
                command: 'vscode.open',
                arguments: [vscode.Uri.parse(holder.link)]
            } as vscode.Command;
        }

        return treeItem;
    }

    getChildren(element?: vscode.TreeItem): Thenable<any[]> {
        // No selected node - No component issues details view
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }

        // Return title nodes
        if (!element) {
            return Promise.resolve(this.getTitleNodes(this._selectedNode));
        }

        // Return vulnerabilities under VulnerabilitiesTitleNode
        if (element instanceof VulnerabilitiesTitleNode) {
            return Promise.resolve(this.getVulnerabilityNodes(this._selectedNode));
        }

        // Return severity, type, component and fixed versions
        if (element instanceof VulnerabilityNode) {
            return Promise.resolve(this.getVulnerabilityDetailsNodes(element));
        }

        // Return licenses under LicensesTitleNode
        if (element instanceof LicensesTitleNode) {
            return Promise.resolve(this.getLicenseNodes(element));
        }

        // References node - Return references
        if (element instanceof ReferencesNode) {
            return Promise.resolve(element.getChildren());
        }

        // License selected
        return Promise.resolve(this.getViolatedLicenseComponentsNodes(element as ViolatedLicenseNode));
    }

    /**
     * Select node in Component Issues Details after selecting a node in the Components Tree.
     * @param selectedNode - the selected node in the DependenciesTreeNode
     */
    public selectNode(selectedNode: DependenciesTreeNode): void {
        this._selectedNode = selectedNode;
        this.refresh();
    }

    /**
     * If there are violated licenses, show "Violated Licenses" and "Vulnerabilities" nodes.
     * Otherwise, show the vulnerability nodes without the title nodes
     * @param selectedNode - the selected node in the components tree
     * @returns VulnerabilitiesTitleNode and LicensesTitleNode if there are violated licenses. VulnerabilityNode[] otherwise.
     */
    private getTitleNodes(selectedNode: DependenciesTreeNode): vscode.TreeItem[] {
        let violatedLicenses: Map<string, Set<string>> = selectedNode.getViolatedLicenses();
        if (violatedLicenses.size > 0) {
            return [new VulnerabilitiesTitleNode(), new LicensesTitleNode(violatedLicenses)] as vscode.TreeItem[];
        }
        return this.getVulnerabilityNodes(selectedNode);
    }

    /**
     * Get the VulnerabilityNode array of the selected node in the components tree.
     * @param selectedNode - the selected node in the components tree
     * @returns VulnerabilityNode array
     */
    private getVulnerabilityNodes(selectedNode: DependenciesTreeNode): VulnerabilityNode[] {
        let children: VulnerabilityNode[] = [];
        selectedNode.issues.forEach(xrayIssueId => {
            if (xrayIssueId.issue_id === Consts.MISSING_COMPONENT) {
                return;
            }
            let issue: IIssueCacheObject | undefined = this._scanCacheManager.getIssue(xrayIssueId.issue_id);
            if (!issue) {
                return;
            }
            let issueNode: VulnerabilityNode = new VulnerabilityNode(
                issue.severity,
                issue.summary,
                issue.cves,
                issue.references,
                xrayIssueId.component,
                issue.fixedVersions
            );
            children.push(issueNode);
        });
        children.sort((lhs, rhs) => rhs.severity - lhs.severity);
        return children;
    }

    /**
     * Return Severity, Component, CVEs, and Fixed Versions of a vulnerability.
     * @param node - the vulnerability node
     * @returns Severity, Component, CVEs, and Fixed Versions of a vulnerability
     */
    private getVulnerabilityDetailsNodes(node: VulnerabilityNode): (TreeDataHolder | ReferencesNode)[] {
        let children: (TreeDataHolder | ReferencesNode)[] = [
            new TreeDataHolder('Severity', SeverityUtils.getString(node.severity)),
            new TreeDataHolder('Component', node.component)
        ];
        let cves: string[] | undefined = node.cves;
        if (cves && cves.length > 0) {
            children.push(new TreeDataHolder('CVEs', cves.toString()));
        }
        let fixedVersions: string[] | undefined = node.fixedVersions;
        if (fixedVersions && fixedVersions.length > 0) {
            children.push(new TreeDataHolder('Fixed Versions', fixedVersions.join(', ')));
        }
        let references: string[] | undefined = node.references;
        if (references && references.length > 0) {
            children.push(new ReferencesNode(references));
        }
        return children;
    }

    /**
     * Return ViolatedLicenseNode array of violated licences.
     * @param node - the license title node
     * @returns ViolatedLicenseNode array of violated licences
     */
    private getLicenseNodes(node: LicensesTitleNode): ViolatedLicenseNode[] {
        let children: ViolatedLicenseNode[] = [];
        for (let [violatedLicense, components] of node.violatedLicenses) {
            children.push(new ViolatedLicenseNode(violatedLicense, components));
        }
        return children;
    }

    /**
     * Return components of a violated license node.
     * @param node - the violated license node
     * @returns components of a violated license node
     */
    private getViolatedLicenseComponentsNodes(node: ViolatedLicenseNode): TreeDataHolder[] {
        let children: TreeDataHolder[] = [];
        node.components.forEach(component => {
            children.push(new TreeDataHolder(component));
        });
        return children;
    }
}

/**
 * Represents "Vulnerabilities" node.
 */
export class VulnerabilitiesTitleNode extends vscode.TreeItem {
    constructor() {
        super('Vulnerabilities', vscode.TreeItemCollapsibleState.Expanded);
    }
}

/**
 * Represents "Violated Licenses" node.
 */
export class LicensesTitleNode extends vscode.TreeItem {
    private _violatedLicenses: Map<string, Set<string>>;

    constructor(violatedLicenses: Map<string, Set<string>>) {
        super('Violated Licences', vscode.TreeItemCollapsibleState.Expanded);
        this._violatedLicenses = violatedLicenses;
    }

    public get violatedLicenses(): Map<string, Set<string>> {
        return this._violatedLicenses;
    }
}

/**
 * Represents a violated license node.
 */
export class ViolatedLicenseNode extends vscode.TreeItem {
    constructor(readonly licenseName: string, readonly components: Set<string>) {
        super(licenseName, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = IconsPaths.VIOLATED_LICENSE;
    }
}

/**
 * Represents a vulnerability node.
 */
export class VulnerabilityNode extends vscode.TreeItem {
    constructor(
        readonly severity: Severity,
        readonly summary: string,
        readonly cves?: string[],
        readonly references?: string[],
        readonly component?: string,
        readonly fixedVersions?: string[]
    ) {
        super(summary, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = SeverityUtils.getIcon(severity ? severity : Severity.Normal);
    }
}

export class ReferencesNode extends vscode.TreeItem {
    constructor(readonly references?: string[]) {
        super('References', vscode.TreeItemCollapsibleState.Collapsed);
    }

    public getChildren(): any[] {
        let children: any[] = [];
        this.references?.forEach(reference => {
            children.push(new TreeDataHolder(reference, '', reference));
        });
        return children;
    }
}
