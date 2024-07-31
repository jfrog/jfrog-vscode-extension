import { IApplicableDetails, IEvidence } from 'jfrog-ide-webview';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AnalyzeIssue, FileIssues, FileRegion } from '../../scanLogic/scanRunners/analyzerModels';
import { CveApplicableDetails } from '../../scanLogic/scanRunners/applicabilityScan';
import { SastIssue, SastIssueLocation } from '../../scanLogic/scanRunners/sastScan';
import { Severity, SeverityUtils } from '../../types/severity';
import { DependencyScanResults, ScanResults } from '../../types/workspaceIssuesDetails';
import { Translators } from '../../utils/translators';
import { ApplicableTreeNode } from '../issuesTree/codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from '../issuesTree/codeFileTree/codeFileTreeNode';
import { IacTreeNode } from '../issuesTree/codeFileTree/iacTreeNode';
import { SastTreeNode } from '../issuesTree/codeFileTree/sastTreeNode';
import { SecretTreeNode } from '../issuesTree/codeFileTree/secretsTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { EnvironmentTreeNode } from '../issuesTree/descriptorTree/environmentTreeNode';
import { ProjectDependencyTreeNode } from '../issuesTree/descriptorTree/projectDependencyTreeNode';
import { FileTreeNode } from '../issuesTree/fileTreeNode';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';
import { IssuesRootTreeNode } from '../issuesTree/issuesRootTreeNode';

export interface FileWithSecurityIssues {
    full_path: string;
    issues: SecurityIssue[];
}

export interface SecurityIssue {
    ruleId: string;
    ruleName: string;
    severity: Severity;
    fullDescription?: string;
    locations: FileRegion[];
}

export class AnalyzerUtils {
    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the issue created
     */
    public static getOrCreateSecurityIssue(
        fileWithIssues: FileWithSecurityIssues,
        analyzeIssue: AnalyzeIssue,
        fullDescription?: string
    ): SecurityIssue {
        let potential: SecurityIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: SecurityIssue = {
            ruleId: analyzeIssue.ruleId,
            severity: Translators.levelToSeverity(analyzeIssue.level),
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as SecurityIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    public static getOrCreateFileWithSecurityIssues(response: { filesWithIssues: FileWithSecurityIssues[] }, uri: string): FileWithSecurityIssues {
        let potential: FileWithSecurityIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: FileWithSecurityIssues = {
            full_path: uri,
            issues: []
        } as FileWithSecurityIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * @param iacResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public static generateIssueData(response: { filesWithIssues: FileWithSecurityIssues[] }, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: FileWithSecurityIssues = AnalyzerUtils.getOrCreateFileWithSecurityIssues(
                response,
                location.physicalLocation.artifactLocation.uri
            );
            let fileIssue: SecurityIssue = AnalyzerUtils.getOrCreateSecurityIssue(fileWithIssues, analyzeIssue, fullDescription);
            fileIssue.locations.push(location.physicalLocation.region);
        });
    }

    /**
     * The paths that returns from the analyzerManager follows the SARIF format and are encoded, with prefix and fixed (not os depended).
     * This method will parse a given path and will fix it to match the actual path expected by the vscode
     * * Remove the prefix 'file:///' for windows or 'file://' if exists.
     * * replaces '/' with '\\' for windows.
     * * decode the encoded path.
     * @param filePath - path to remove prefix and decode
     */
    public static parseLocationFilePath(filePath: string): string {
        let isWindows: boolean = os.platform() === 'win32';
        if (isWindows) {
            filePath = filePath.includes('file:///') ? filePath.substring('file:///'.length) : filePath;
        }
        filePath = filePath.includes('file://') ? filePath.substring('file://'.length) : filePath;
        if (isWindows) {
            filePath = filePath.replace(/['/']/g, '\\');
            // make the first char uppercase
            filePath = filePath.charAt(0).toUpperCase() + filePath.slice(1);
        }
        return decodeURI(filePath);
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
     * Check if two ranges are equals
     * @param region - first range
     * @param other - second range
     * @returns true if the ranges match false otherwise
     */
    public static isEqualRange(range: vscode.Range, other: vscode.Range): boolean {
        return range.start.isEqual(other.start) && range.end.isEqual(other.end);
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
        let node: FileTreeNode | undefined = root.children.find(child => actualPath == child.projectFilePath);
        if (node instanceof CodeFileTreeNode) {
            return node;
        }
        let fileNode: CodeFileTreeNode = new CodeFileTreeNode(actualPath);
        root.addChild(fileNode);
        return fileNode;
    }

    /**
     * Transform the exclude pattern to patterns for the analyzer scans.
     * The following actions will be preformed to the pattern:
     * 1. If validation for the exclude pattern fails no exclude will be returned.
     * 2. If pattern contains {}, it will be splitted to multiple patterns, one for each option
     * 3. '/**' will be add at the suffix to convert the pattern to match files and not folders
     * @param excludePattern - the pattern to transform
     * @returns the transformed pattern array
     */
    public static getAnalyzerManagerExcludePatterns(excludePattern?: string): string[] {
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
     * Retrieve the workspace path, whether it's a file or an environment.
     * @param fileScanBundle - The data node for file tree, usually DescriptorTreeNode or EnvironmentTreeNode
     * @param fullWorkspacePath - Full path to the scanning directory or file
     * @returns the path to the workspace directory
     */
    public static getWorkspacePath(fileScanBundle: FileTreeNode | undefined, fullWorkspacePath: string): string {
        if (fileScanBundle instanceof EnvironmentTreeNode) {
            return fullWorkspacePath;
        }
        return path.dirname(fullWorkspacePath);
    }

    /**
     * Populate the applicable data to the view (create file issue nodes)
     * @param root - the root to populate the data inside
     * @param descriptorNode - the node of the descriptor that the applicable data is related to
     * @param dependencyScanResults - the descriptor data with the applicable information inside
     * @returns the number of issues that were populated from the data
     */
    public static populateApplicableIssues(
        root: IssuesRootTreeNode,
        descriptorNode: ProjectDependencyTreeNode,
        dependencyScanResults: DependencyScanResults
    ): number {
        // Populate descriptor node with data
        descriptorNode.scannedCve = new Set<string>(dependencyScanResults.applicableIssues?.scannedCve ?? []);
        descriptorNode.applicableCve = new Map<string, CveApplicableDetails>(
            dependencyScanResults.applicableIssues ? Object.entries(dependencyScanResults.applicableIssues.applicableCve) : []
        );
        descriptorNode.applicableScanTimeStamp = dependencyScanResults.applicableScanTimestamp;

        // Populate related CodeFile nodes with issues and update the descriptor CVE applicability details
        let issuesCount: number = 0;
        descriptorNode.scannedCve.forEach(cve => {
            // Check if the descriptor has this cve issue
            let nodes: IssueTreeNode[] | undefined = descriptorNode.getIssueById(cve);
            if (!nodes) {
                return;
            }
            for (const node of nodes) {
                if (node instanceof CveTreeNode) {
                    let potential: CveApplicableDetails | undefined = descriptorNode.applicableCve?.get(node.labelId);
                    if (potential) {
                        let details: CveApplicableDetails = potential;
                        let evidences: IEvidence[] = [];
                        // Populate code file issues for workspace
                        details.fileEvidences.forEach((fileEvidence: FileIssues) => {
                            let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileEvidence.full_path);
                            issuesCount += this.populateEvidence(fileEvidence, details.fixReason, <CveTreeNode>node, evidences, fileNode);
                        });
                        // Applicable
                        node.applicableDetails = {
                            isApplicable: true,
                            searchTarget: details.fullDescription,
                            evidence: evidences
                        } as IApplicableDetails;
                    } else {
                        // Not applicable
                        node.severity = SeverityUtils.notApplicable(node.severity);
                        node.applicableDetails = { isApplicable: false } as IApplicableDetails;
                    }
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
                let range: vscode.Range = new vscode.Range(
                    new vscode.Position(location.startLine, location.startColumn),
                    new vscode.Position(location.endLine, location.endColumn)
                );
                if (fileNode.addIssue(new ApplicableTreeNode(issueNode, fileNode, range, issueNode.severity))) {
                    issuesCount++;
                }
            }
        });
        return issuesCount;
    }

    /**
     * Populate Iac information in the given node
     * @param root - root node to populate data inside
     * @param workspaceData - data to populate on node
     * @returns number of Iac issues populated
     */
    public static populateIacIssues(root: IssuesRootTreeNode, workspaceData: ScanResults): number {
        root.iacScanTimeStamp = workspaceData.iacScanTimestamp;
        let issuesCount: number = 0;
        if (workspaceData.iacScan && workspaceData.iacScan.filesWithIssues) {
            workspaceData.iacScan.filesWithIssues.forEach((fileWithIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
                fileWithIssues.issues.forEach((issue: SecurityIssue) => {
                    issue.locations.forEach((location: FileRegion) => {
                        if (fileNode.addIssue(new IacTreeNode(issue, location, fileNode))) {
                            issuesCount++;
                        }
                    });
                });
            });
        }

        return issuesCount;
    }

    /**
     * Populate Secrets information in the given node
     * @param root - root node to populate data inside
     * @param workspaceData - data to populate on node
     * @returns number of Secret issues populated
     */
    public static populateSecretsIssues(root: IssuesRootTreeNode, workspaceData: ScanResults): number {
        root.secretsScanTimeStamp = workspaceData.secretsScanTimestamp;
        let issuesCount: number = 0;
        if (workspaceData.secretsScan && workspaceData.secretsScan.filesWithIssues) {
            workspaceData.secretsScan.filesWithIssues.forEach((fileWithIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
                fileWithIssues.issues.forEach((issue: SecurityIssue) => {
                    issue.locations.forEach((location: FileRegion) => {
                        if (fileNode.addIssue(new SecretTreeNode(issue, location, fileNode))) {
                            issuesCount++;
                        }
                    });
                });
            });
        }

        return issuesCount;
    }

    /**
     * Populate SAST information in the view
     * @param root - root node to populate data inside
     * @param workspaceData - data to populate on node
     * @returns number of SAST issues populated
     */
    public static populateSastIssues(root: IssuesRootTreeNode, workspaceData: ScanResults): number {
        root.sastScanTimeStamp = workspaceData.sastScanTimestamp;
        let issuesCount: number = 0;
        if (workspaceData.sastScan && workspaceData.sastScan.filesWithIssues) {
            workspaceData.sastScan.filesWithIssues.forEach(fileWithIssues => {
                let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
                fileWithIssues.issues.forEach((issue: SastIssue) => {
                    issue.locations.forEach((location: SastIssueLocation) => {
                        fileNode.issues.push(new SastTreeNode(issue, location, fileNode));
                        issuesCount++;
                    });
                });
            });
        }

        return issuesCount;
    }
}
