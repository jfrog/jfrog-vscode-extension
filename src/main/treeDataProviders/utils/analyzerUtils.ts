import * as vscode from 'vscode';
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

    /**
     * Remove the prefix 'file://'
     * @param filePath - path to remove prefix
     */
    public static parseLocationFilePath(filePath: string): string {
        return filePath.includes('file://') ? filePath.substring('file://'.length) : filePath;
    }

    /**
     * Get or create CodeFileNode object if not exists in root and update its severity if provided
     * @param root - the root to search the node inside
     * @param filePath - the file path to search
     * @param severity - the optional new severity of the file
     * @returns file node
     */
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

    /**
     * Populate the applicable data to the view (create file issue nodes)
     * @param root - the root to populate the data inside
     * @param descriptorNode - the node of the descriptor that the applicable data is related to
     * @param descriptorData - the descriptor data with the applicable information inside
     * @returns the number of issues that were populated from the data
     */
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
                                fileNode.issues.push(
                                    new ApplicableTreeNode(
                                        cve,
                                        <CveTreeNode>node,
                                        fileNode,
                                        new vscode.Range(
                                            new vscode.Position(location.startLine, location.startColumn),
                                            new vscode.Position(location.endLine, location.endColumn)
                                        ),
                                        node?.severity
                                    )
                                );
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

    // public static async runEos(
    //     workspaceData: WorkspaceIssuesData,
    //     root: IssuesRootTreeNode,
    //     workspcaeDescriptors: Map<PackageType, vscode.Uri[]>,
    //     progressManager: StepProgress
    // ): Promise<any> {
    //     // Prepare
    //     let requests: EosScanRequest[] = [];
    //     for (const [type, descriptorPaths] of workspcaeDescriptors) {
    //         let language: string | undefined;
    //         switch (type) {
    //             case PackageType.Python:
    //                 language = 'python';
    //                 break;
    //             case PackageType.Maven:
    //                 language = 'java';
    //                 break;
    //             case PackageType.Npm:
    //                 language = 'js';
    //                 break;
    //         }
    //         if (language) {
    //             let roots: Set<string> = new Set<string>();
    //             for (const descriptorPath of descriptorPaths) {
    //                 let directory: string = path.dirname(descriptorPath.fsPath);
    //                 if (!roots.has(directory)) {
    //                     roots.add(directory);
    //                     // TODO: removw when issue on eos is resolve
    //                     requests.push({
    //                         language: language,
    //                         roots: [directory]
    //                     } as EosScanRequest);
    //                 }
    //             }
    //             // TODO: uncomment when issue on eos is resolve
    //             // if (roots.size > 0) {
    //             //     requests.push({
    //             //         language: language,
    //             //         roots: Array.from(roots)
    //             //     } as EosScanRequest);
    //             // }
    //         }
    //     }
    //     if (requests.length == 0) {
    //         progressManager.reportProgress();
    //         return;
    //     }
    //     let startTime: number = Date.now();
    //     workspaceData.eosScan = await this._scanManager.scanEos(...requests).finally(() => progressManager.reportProgress());
    //     if (workspaceData.eosScan) {
    //         workspaceData.eosScanTimestamp = Date.now();
    //         let applicableIssuesCount: number = AnalyzerUtils.populateEosIssues(root, workspaceData);
    //         this._logManager.logMessage(
    //             'Found ' +
    //                 applicableIssuesCount +
    //                 " Eos issues in workspace = '" +
    //                 workspaceData.path +
    //                 "' (elapsed:" +
    //                 (Date.now() - startTime) / 1000 +
    //                 'sec)',
    //             'DEBUG'
    //         );

    //         root.apply();
    //         progressManager.onProgress();
    //     }
    // }

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
}
