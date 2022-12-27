import { IApplicableDetails, IEvidence } from 'jfrog-ide-webview';
import { DescriptorIssuesData } from '../../cache/issuesCache';
import { CveApplicableDetails } from '../../scanLogic/scanRunners/applicabilityScan';
import { Severity } from '../../types/severity';
import { ApplicableTreeNode } from '../issuesTree/codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from '../issuesTree/codeFileTree/codeFileTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { DescriptorTreeNode } from '../issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../issuesTree/issuesRootTreeNode';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';

export class AnalyzerUtils {
    public static parseLocationFilePath(filePath: string): string {
        return filePath.includes('file://') ? filePath.substring('file://'.length) : filePath;
    }

    public static getOrCreateCodeFileNode(root: IssuesRootTreeNode, filePath: string, severity?: Severity): CodeFileTreeNode {
        let actualPath: string = this.parseLocationFilePath(filePath);
        let node: FileTreeNode | undefined = root.children.find(child => actualPath == child.fullPath);
        if (node instanceof CodeFileTreeNode) {
            if (severity && severity > node.severity) {
                node.severity = severity;
            }
            return node;
        }
        let fileNode: CodeFileTreeNode = new CodeFileTreeNode(actualPath);
        fileNode.severity = severity;
        root.addChild(fileNode);
        return fileNode;
    }

    // public static populateEosIssues(root: IssuesRootTreeNode, workspaceData: WorkspaceIssuesData): number {
    //     root.eosScanTimeStamp = workspaceData.eosScanTimestamp;
    //     let issuesCount: number = 0;
    //     if (workspaceData.eosScan && workspaceData.eosScan.filesWithIssues) {
    //         workspaceData.eosScan.filesWithIssues.forEach(fileWithIssues => {
    //             let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
    //             fileWithIssues.issues.forEach(issue => {
    //                 issue.regions.forEach(region => {
    //                     fileNode.issues.push(new CodeIssueTreeNode(issue.ruleId, fileNode, region));
    //                     issuesCount++;
    //                 });
    //             });
    //         });
    //     }

    //     return issuesCount;
    // }

    public static populateApplicableIssues(
        root: IssuesRootTreeNode,
        descriptorNode: DescriptorTreeNode,
        descriptorData: DescriptorIssuesData
    ): number {
        descriptorNode.scannedCve = new Set<string>(descriptorData.applicableIssues?.scannedCve ?? []);
        descriptorNode.applicableCve = new Map<string, CveApplicableDetails>(
            descriptorData.applicableIssues ? Object.entries(descriptorData.applicableIssues.applicableCve) : []
        );
        descriptorNode.applicableScanTimeStamp = descriptorData.applicableScanTimestamp;

        let issuesCount: number = 0;

        descriptorNode.scannedCve.forEach(cve => {
            // Check if the descriptor discovered this cve
            let node: IssueTreeNode | undefined = descriptorNode.getIssueById(cve);
            if (node instanceof CveTreeNode && node.cve) {
                let details: CveApplicableDetails | undefined = descriptorNode.applicableCve?.get(node.cve.cve);
                if (details) {
                    let evidences: IEvidence[] = [];
                    // Populate code file issues for workspace
                    details.fileEvidences.forEach(fileEvidence => {
                        let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileEvidence.full_path, node?.severity);
                        fileEvidence.locations.forEach(location => {
                            if (location.snippet) {
                                evidences.push({
                                    filePathEvidence: this.parseLocationFilePath(fileEvidence.full_path),
                                    codeEvidence: location.snippet.text
                                } as IEvidence);
                                fileNode.issues.push(new ApplicableTreeNode(cve, fileNode, location, node?.severity));
                                issuesCount++;
                            }
                        });
                    });
                    // Applicable
                    node.applicableDetails = { isApplicable: true, reason: details.fixReason, evidence: evidences } as IApplicableDetails;
                } else {
                    // Not applicable
                    node.applicableDetails = { isApplicable: false } as IApplicableDetails;
                }
            }
        });
        return issuesCount;
    }
}
