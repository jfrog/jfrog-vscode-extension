import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../cache/scanCacheManager';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { Severity, SeverityUtils } from '../types/severity';
import { Consts } from '../utils/consts';
import { IconsPaths } from '../utils/iconsPaths';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';
import { Utils } from './utils/utils';
import { IExtendedInformation, IReference } from 'jfrog-client-js';

export abstract class IssueNode extends vscode.TreeItem {
    constructor(label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}
/**
 * The component issues tab in 'Dependency Details' panel.
 */
export class IssuesDataProvider extends IssueNode implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _selectedNode!: DependenciesTreeNode;

    constructor(protected _scanCacheManager: ScanCacheManager) {
        // Open issue tab by default.
        super('Issues', vscode.TreeItemCollapsibleState.Expanded);
    }

    public get selectedNode(): DependenciesTreeNode {
        return this._selectedNode;
    }

    public set selectedNode(value: DependenciesTreeNode) {
        this._selectedNode = value;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        if (element instanceof VulnerabilityNode) {
            element.command = Utils.createNodeCommand('jfrog.view.dependency.vulnerability', 'Show details', [element]);
        }
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
        if (holder.toolTip) {
            treeItem.tooltip = holder.toolTip;
        }
        treeItem.command = holder.command;
        return treeItem;
    }

    getChildren(element?: vscode.TreeItem): Thenable<any[]> {
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

        if (element instanceof ViolatedLicenseNode) {
            // License selected
            return Promise.resolve(this.getViolatedLicenseComponentsNodes(element as ViolatedLicenseNode));
        }
        return Promise.resolve(this.getTitleNodes(this._selectedNode));
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
            if (issue.cves.length === 0) {
                // In case we dont have anny CVE for the given Xray issue, Show the summary as the title.
                let issueNode: VulnerabilityNode = new VulnerabilityNode(
                    xrayIssueId.issue_id,
                    issue.severity,
                    issue.summary,
                    issue.edited,
                    undefined,
                    issue.references,
                    xrayIssueId.component,
                    issue.fixedVersions,
                    undefined,
                    issue.researchInfo
                );
                children.push(issueNode);
            } else {
                // Include a CVE applicability note for components that are found to be affected by CVE applicability scanner.
                for (let cve of issue.cves) {
                    let applicable: boolean | undefined = undefined;
                    let issueNode: VulnerabilityNode = new VulnerabilityNode(
                        xrayIssueId.issue_id,
                        issue.severity,
                        issue.summary,
                        issue.edited,
                        cve,
                        issue.references,
                        xrayIssueId.component,
                        issue.fixedVersions,
                        applicable,
                        issue.researchInfo
                    );
                    children.push(issueNode);
                }
            }
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
            new TreeDataHolder('Summary', node.summary),
            new TreeDataHolder('Severity', SeverityUtils.getString(node.severity)),
            new TreeDataHolder('Component', node.component)
        ];
        let fixedVersions: string[] | undefined = node.fixedVersions;
        if (fixedVersions && fixedVersions.length > 0) {
            children.push(new TreeDataHolder('Fixed Versions', fixedVersions.join(', ')));
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
export class VulnerabilitiesTitleNode extends IssueNode {
    constructor() {
        super('Vulnerabilities', vscode.TreeItemCollapsibleState.Expanded);
    }
}

/**
 * Represents "Violated Licenses" node.
 */
export class LicensesTitleNode extends IssueNode {
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
export class ViolatedLicenseNode extends IssueNode {
    constructor(readonly licenseName: string, readonly components: Set<string>) {
        super(licenseName, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = IconsPaths.VIOLATED_LICENSE;
    }
}

/**
 * Represents a vulnerability node.
 */
export class VulnerabilityNode extends IssueNode {
    constructor(
        readonly xrayId: string,
        readonly severity: Severity,
        readonly summary: string,
        readonly edited: string,
        readonly cve?: string,
        readonly references?: IReference[],
        readonly component?: string,
        readonly fixedVersions?: string[],
        readonly applicable?: boolean, // If false, the given CVE is not applicable in the source code. If true, the given CVE is applicable in the source code.  If undefined, The CVE cannot be discovered.
        readonly researchInfo?: IExtendedInformation
    ) {
        super(cve ? cve : xrayId, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = SeverityUtils.getIcon(severity ? severity : Severity.Normal);
    }

    public showSummaryOnTitle(): boolean {
        return this.cve !== undefined;
    }
}

export class ReferencesNode extends IssueNode {
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
