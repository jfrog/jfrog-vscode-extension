import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { IApplicableDetails, IEvidence } from 'jfrog-ide-webview';
import { CveApplicableDetails } from '../../scanLogic/scanRunners/applicabilityScan';
import { SeverityUtils } from '../../types/severity';
import { ApplicableTreeNode } from '../issuesTree/codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from '../issuesTree/codeFileTree/codeFileTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { DescriptorTreeNode } from '../issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../issuesTree/issuesRootTreeNode';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';
import { PackageType } from '../../types/projectType';
import { StepProgress } from './stepProgress';
import { EosScanRequest } from '../../scanLogic/scanRunners/eosScan';
import { ScanManager } from '../../scanLogic/scanManager';
import { FileIssues, FileRegion } from '../../scanLogic/scanRunners/analyzerModels';
import { DescriptorIssuesData, WorkspaceIssuesData } from '../../types/issuesData';
import { EosTreeNode } from '../issuesTree/codeFileTree/eosTreeNode';

export class AnalyzerUtils {
    /**
     * Remove the prefix 'file://' and decode the encoded path from binary result
     * @param filePath - path to remove prefix and decode
     */
    public static parseLocationFilePath(filePath: string): string {
        if (os.platform() === 'win32') {
            return decodeURI((filePath.includes('file:///') ? filePath.substring('file:///'.length) : filePath).replace(/['/']/g, '\\'));
        }
        return decodeURI(filePath.includes('file://') ? filePath.substring('file://'.length) : filePath);
    }

    /**
     * Check if two regions are equals
     * @param region - first region
     * @param other - second region
     * @returns true if the regions match false otherwise
     */
    public static isSameRegion(region: FileRegion, other: FileRegion): boolean {
        return (
            region.startLine === other.startLine &&
            region.endLine === other.endLine &&
            region.startColumn === other.startColumn &&
            region.endColumn === other.endColumn
        );
    }

    /**
     * Get or create CodeFileNode object if not exists in root and update its severity if provided
     * @param root - the root to search the node inside
     * @param filePath - the file path to search
     * @param severity - the optional new severity of the file
     * @returns file node
     */
    public static getOrCreateCodeFileNode(root: IssuesRootTreeNode, filePath: string): CodeFileTreeNode {
        let actualPath: string = this.parseLocationFilePath(filePath);
        let node: FileTreeNode | undefined = root.children.find(child => actualPath == child.fullPath);
        if (node instanceof CodeFileTreeNode) {
            return node;
        }
        let fileNode: CodeFileTreeNode = new CodeFileTreeNode(actualPath);
        root.addChild(fileNode);
        return fileNode;
    }

    /**
     * Transform the exclude pattern to patterns for the applicable scan.
     * The following actions will be preformed to the pattern:
     * 1. If validation for the exclude pattern fails no exclude will be returned.
     * 2. If pattern contains {}, it will be splitted to multiple patterns, one for each option
     * 3. '/**' will be add at the suffix to convert the pattern to match files and not folders
     * @param excludePattern - the pattern to transform
     * @returns the applicable pattern array
     */
    public static getApplicableExcludePattern(excludePattern?: string): string[] {
        let patterns: string[] = [];
        if (!excludePattern) {
            return patterns;
        }
        let bracketOpeningIndex: number = excludePattern.indexOf('{');
        let bracketClosingIndex: number = excludePattern.indexOf('}');

        if (bracketOpeningIndex >= 0 && bracketClosingIndex > bracketOpeningIndex) {
            // Convert <PREFIX>{option1,option2,...}<SUFFIX> to [<PREFIX>option1<SUFFIX>/** ,<PREFIX>option2<SUFFIX>/**, ...]
            let prefix: string = excludePattern.substring(0, bracketOpeningIndex);
            let suffix: string = excludePattern.substring(bracketClosingIndex + 1);
            let options: string[] = excludePattern.substring(bracketOpeningIndex + 1, bracketClosingIndex).split(',');
            options.forEach(option => patterns.push(prefix + option + suffix + (suffix.endsWith('/**') ? '' : '/**')));
        } else {
            patterns.push(excludePattern + (excludePattern.endsWith('/**') ? '' : '/**'));
        }
        return patterns;
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
        // Populate descriptor node with data
        descriptorNode.scannedCve = new Set<string>(descriptorData.applicableIssues?.scannedCve ?? []);
        descriptorNode.applicableCve = new Map<string, CveApplicableDetails>(
            descriptorData.applicableIssues ? Object.entries(descriptorData.applicableIssues.applicableCve) : []
        );
        descriptorNode.applicableScanTimeStamp = descriptorData.applicableScanTimestamp;

        // Populate related CodeFile nodes with issues and update the descriptor CVE applicability details
        let issuesCount: number = 0;
        descriptorNode.scannedCve.forEach(cve => {
            // Check if the descriptor has this cve issue
            let node: IssueTreeNode | undefined = descriptorNode.getIssueById(cve);
            if (node instanceof CveTreeNode && node.cve) {
                let potential: CveApplicableDetails | undefined = descriptorNode.applicableCve?.get(node.cve.cve);
                if (potential) {
                    let details: CveApplicableDetails = potential;
                    let evidences: IEvidence[] = [];
                    // Populate code file issues for workspace
                    details.fileEvidences.forEach(fileEvidence => {
                        let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileEvidence.full_path);
                        issuesCount += this.populateEvidence(fileEvidence, details.fixReason, <CveTreeNode>node, evidences, fileNode);
                    });
                    // Applicable
                    node.applicableDetails = { isApplicable: true, searchTarget: details.fullDescription, evidence: evidences } as IApplicableDetails;
                } else {
                    // Not applicable
                    node.severity = SeverityUtils.notApplicable(node.severity);
                    node.applicableDetails = { isApplicable: false } as IApplicableDetails;
                }
            }
        });
        return issuesCount;
    }

    /**
     * Populate the file evidence (ApplicableTreeNode) result in the file node and evidences list
     * @param fileEvidence - the evidences in the file to populate
     * @param reason - the reason this evidence is an issue
     * @param issueNode - the CVE node related to the issues
     * @param evidences - the evidences list to populate data inside
     * @param fileNode - the node to populate children inside
     * @returns the number of Evidences for the issue that were populated
     */
    private static populateEvidence(
        fileEvidence: FileIssues,
        reason: string,
        issueNode: CveTreeNode,
        evidences: IEvidence[],
        fileNode: CodeFileTreeNode
    ): number {
        let issuesCount: number = 0;
        fileEvidence.locations.forEach(location => {
            if (location.snippet) {
                // add evidence for CVE applicability details
                evidences.push({
                    reason: reason,
                    filePathEvidence: AnalyzerUtils.parseLocationFilePath(fileEvidence.full_path),
                    codeEvidence: location.snippet.text
                } as IEvidence);
                // Populate nodes
                fileNode.issues.push(
                    new ApplicableTreeNode(
                        issueNode,
                        fileNode,
                        new vscode.Range(
                            new vscode.Position(location.startLine, location.startColumn),
                            new vscode.Position(location.endLine, location.endColumn)
                        ),
                        issueNode.severity
                    )
                );
                issuesCount++;
            }
        });
        return issuesCount;
    }

    /**
     *  Run eos scan async task
     * @param workspaceData - the issues data for the workspace
     * @param root - the root node of the workspace
     * @param workspaceDescriptors - the descriptors of the workspace to get roots to scan from
     * @param scanManager - the scan manager to use for scan
     * @param progressManager - the progress manager of the process for abort control
     * @param splitRequests - if true each request will be preformed on a different run, false all at once
     */
    public static async runEos(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        workspaceDescriptors: Map<PackageType, vscode.Uri[]>,
        scanManager: ScanManager,
        progressManager: StepProgress,
        splitRequests: boolean = true
    ): Promise<any> {
        // Prepare
        let requests: EosScanRequest[] = [];
        for (const [type, descriptorPaths] of workspaceDescriptors) {
            let language: string | undefined;
            switch (type) {
                case PackageType.Python:
                    language = 'python';
                    break;
            }
            if (language) {
                let roots: Set<string> = new Set<string>();
                for (const descriptorPath of descriptorPaths) {
                    let directory: string = path.dirname(descriptorPath.fsPath);
                    if (!roots.has(directory)) {
                        roots.add(directory);
                        if (splitRequests) {
                            requests.push({
                                language: language,
                                roots: [directory]
                            } as EosScanRequest);
                        }
                    }
                }
                if (!splitRequests && roots.size > 0) {
                    requests.push({
                        language: language,
                        roots: Array.from(roots)
                    } as EosScanRequest);
                }
            }
        }
        if (requests.length == 0) {
            progressManager.reportProgress();
            return;
        }
        // Run
        let startTime: number = Date.now();
        workspaceData.eosScan = await scanManager
            .scanEos(progressManager.abortController, ...requests)
            .finally(() => progressManager.reportProgress());
        if (workspaceData.eosScan) {
            workspaceData.eosScanTimestamp = Date.now();
            let applicableIssuesCount: number = AnalyzerUtils.populateEosIssues(root, workspaceData);
            scanManager.logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " Eos issues in workspace = '" +
                    workspaceData.path +
                    "' (elapsed:" +
                    (Date.now() - startTime) / 1000 +
                    'sec)',
                'DEBUG'
            );

            root.apply();
            progressManager.onProgress();
        }
    }

    /**
     * Populate eos information in
     * @param root - root node to populate data inside
     * @param workspaceData - data to populate on node
     * @returns number of eos issues populated
     */
    public static populateEosIssues(root: IssuesRootTreeNode, workspaceData: WorkspaceIssuesData): number {
        root.eosScanTimeStamp = workspaceData.eosScanTimestamp;
        let issuesCount: number = 0;
        if (workspaceData.eosScan && workspaceData.eosScan.filesWithIssues) {
            workspaceData.eosScan.filesWithIssues.forEach(fileWithIssues => {
                let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
                fileWithIssues.issues.forEach(issue => {
                    issue.locations.forEach(location => {
                        fileNode.issues.push(new EosTreeNode(issue, location, fileNode));
                        issuesCount++;
                    });
                });
            });
        }

        return issuesCount;
    }
}
