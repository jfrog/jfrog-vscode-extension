import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { IApplicableDetails, IEvidence } from 'jfrog-ide-webview';
import { ApplicabilityScanResponse, CveApplicableDetails } from '../../scanLogic/scanRunners/applicabilityScan';
import { Severity, SeverityUtils } from '../../types/severity';
import { ApplicableTreeNode } from '../issuesTree/codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from '../issuesTree/codeFileTree/codeFileTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { FileTreeNode } from '../issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../issuesTree/issuesRootTreeNode';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';
import { PackageType } from '../../types/projectType';
import { StepProgress } from './stepProgress';
import { EosIssue, EosIssueLocation, EosRunner, EosScanRequest, LanguageType } from '../../scanLogic/scanRunners/eosScan';
import { ScanManager } from '../../scanLogic/scanManager';
import { AnalyzeIssue, FileIssues, FileRegion } from '../../scanLogic/scanRunners/analyzerModels';
import { DependencyScanResults, ScanResults } from '../../types/workspaceIssuesDetails';
import { EosTreeNode } from '../issuesTree/codeFileTree/eosTreeNode';
import { FileScanBundle } from '../../utils/scanUtils';
import { IacTreeNode } from '../issuesTree/codeFileTree/iacTreeNode';
import { SecretTreeNode } from '../issuesTree/codeFileTree/secretsTreeNode';
import { Translators } from '../../utils/translators';
import { ProjectDependencyTreeNode } from '../issuesTree/descriptorTree/projectDependencyTreeNode';
import { LogManager } from '../../log/logManager';
import { Utils } from '../../utils/utils';

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
    public static isSameRange(range: vscode.Range, other: vscode.Range): boolean {
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
    public static getAnalyzerManagerExcludePattern(excludePattern?: string): string[] {
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
     * Run CVE applicable scan async task and populate the given bundle with the results.
     * @param scanManager - the ScanManager that preforms the actual scans
     * @param fileScanBundles - the file bundles that contains all the information on scan results
     * @param scanProgress - the progress for the given scan
     */
    public static async cveApplicableScanning(
        scanManager: ScanManager,
        fileScanBundles: FileScanBundle[],
        progressManager: StepProgress
    ): Promise<void> {
        let spaceToBundles: Map<string, Map<FileScanBundle, Set<string>>> = this.mapBundlesForApplicableScanning(
            scanManager.logManager,
            fileScanBundles
        );
        if (spaceToBundles.size == 0) {
            return;
        }
        for (let [spacePath, bundles] of spaceToBundles) {
            let cveToScan: Set<string> = Utils.combineSets(Array.from(bundles.values()));
            // Scan workspace for all cve in relevant bundles
            let startApplicableTime: number = Date.now();
            let applicableIssues: ApplicabilityScanResponse = await scanManager.scanApplicability(spacePath, progressManager.checkCancel, cveToScan);
            if (applicableIssues && applicableIssues.applicableCve) {
                let applicableScanTimestamp: number = Date.now();
                AnalyzerUtils.transferApplicableResponseToBundles(
                    applicableIssues,
                    bundles,
                    scanManager.logManager,
                    applicableScanTimestamp,
                    applicableScanTimestamp - startApplicableTime
                );
            }
        }
    }

    /**
     * Create a mapping between a workspace and all the given bundles that relevant to it.
     * In addition, filter not relevant bundles.
     * @param logManager - logger to log added map
     * @param fileScanBundles - bundles to map
     * @returns mapped bundles to similar workspace
     */
    private static mapBundlesForApplicableScanning(
        logManager: LogManager,
        fileScanBundles: FileScanBundle[]
    ): Map<string, Map<FileScanBundle, Set<string>>> {
        let bundleMap: Map<string, Map<FileScanBundle, Set<string>>> = new Map<string, Map<FileScanBundle, Set<string>>>();

        for (let fileScanBundle of fileScanBundles) {
            if (!(fileScanBundle.dataNode instanceof ProjectDependencyTreeNode)) {
                // Filter non dependencies projects
                continue;
            }
            let descriptorIssues: DependencyScanResults = <DependencyScanResults>fileScanBundle.data;
            // Map information
            let cvesToScan: Set<string> = new Set<string>();
            fileScanBundle.dataNode.issues.forEach((issue: IssueTreeNode) => {
                if (issue instanceof CveTreeNode && !issue.parent.indirect && issue.cve?.cve) {
                    // Only direct cve issues
                    cvesToScan.add(issue.cve.cve);
                }
            });
            if (cvesToScan.size == 0) {
                // Nothing to do in bundle
                continue;
            }
            let spacePath: string = path.dirname(descriptorIssues.fullPath);
            if (!bundleMap.has(spacePath)) {
                bundleMap.set(spacePath, new Map<FileScanBundle, Set<string>>());
            }
            bundleMap.get(spacePath)?.set(fileScanBundle, cvesToScan);
            logManager.logMessage('Adding data from descriptor ' + descriptorIssues.fullPath + ' for cve applicability scan', 'INFO');
        }

        return bundleMap;
    }

    /**
     * Transfer and populate information from a given applicable scan to each bundle
     * @param applicableIssues - full scan response with information relevant to all the bundles
     * @param bundles - the bundles that will be populated only with their relevant information
     * @param logManager - logger to log information to the user
     * @param applicableTimeStamp - ended time stamp for the applicable scan
     * @param elapsedTimeInMillsSec - elapsed time that took the scan to run
     */
    private static transferApplicableResponseToBundles(
        applicableIssues: ApplicabilityScanResponse,
        bundles: Map<FileScanBundle, Set<string>>,
        logManager: LogManager,
        applicableTimeStamp: number,
        elapsedTimeInMillsSec: number
    ) {
        for (let [bundle, relevantCve] of bundles) {
            let descriptorIssues: DependencyScanResults = <DependencyScanResults>bundle.data;
            // Filter only relevant information
            descriptorIssues.applicableScanTimestamp = applicableTimeStamp;
            descriptorIssues.applicableIssues = AnalyzerUtils.filterOnlyRelevantApplicableData(applicableIssues, relevantCve);
            // Populate it in bundle
            let applicableIssuesCount: number = AnalyzerUtils.populateApplicableIssues(
                bundle.root,
                <ProjectDependencyTreeNode>bundle.dataNode,
                descriptorIssues
            );
            logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " applicable CVE issues in descriptor = '" +
                    descriptorIssues.fullPath +
                    "' (elapsed " +
                    elapsedTimeInMillsSec / 1000 +
                    ' seconds)',
                'INFO'
            );
            bundle.root.apply();
        }
    }

    /**
     * Filter a given full applicable data to only relevant information base on a given cve list
     * @param applicableIssues - all the applicable information
     * @param relevantCve - cve list to filter information only for them
     * @returns applicableIssues with information relevant only for the given relevantCve
     */
    private static filterOnlyRelevantApplicableData(
        applicableIssues: ApplicabilityScanResponse,
        relevantCve: Set<string>
    ): ApplicabilityScanResponse {
        let scanned: string[] = [];
        let allApplicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>(Object.entries(applicableIssues.applicableCve));
        let applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();

        for (let scannedCve of applicableIssues.scannedCve) {
            if (relevantCve.has(scannedCve)) {
                scanned.push(scannedCve);
                let potential: CveApplicableDetails | undefined = allApplicable.get(scannedCve);
                if (potential) {
                    applicable.set(scannedCve, potential);
                }
            }
        }
        return {
            scannedCve: Array.from(scanned),
            applicableCve: Object.fromEntries(applicable.entries())
        } as ApplicabilityScanResponse;
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
                if (fileNode.issues.find(issue => this.isSameRange(range, issue.regionWithIssue)) == undefined) {
                    fileNode.issues.push(new ApplicableTreeNode(issueNode, fileNode, range, issueNode.severity));
                }
                issuesCount++;
            }
        });
        return issuesCount;
    }

    /**
     * Run Infrastructure As Code (Iac) scan async task and populate the given bundle with the results.
     * @param scanResults - the data object that will be populated with the results
     * @param root - the view object that will be populated with the results
     * @param scanManager - the ScanManager that preforms the actual scans
     * @param progressManager - the progress for the given scan
     */
    public static async runIac(
        scanResults: ScanResults,
        root: IssuesRootTreeNode,
        scanManager: ScanManager,
        progressManager: StepProgress
    ): Promise<void> {
        let startIacTime: number = Date.now();
        scanResults.iacScan = await scanManager.scanIac(root.workSpace.uri.fsPath, progressManager.checkCancel);
        if (scanResults.iacScan) {
            scanResults.iacScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateIacIssues(root, scanResults);
            scanManager.logManager.logMessage(
                'Found ' +
                    issuesCount +
                    " Iac issues in workspace = '" +
                    scanResults.path +
                    "' (elapsed " +
                    (scanResults.iacScanTimestamp - startIacTime) / 1000 +
                    ' seconds)',
                'INFO'
            );
            root.apply();
        }
        progressManager.reportProgress();
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
                        fileNode.issues.push(new IacTreeNode(issue, location, fileNode));
                        issuesCount++;
                    });
                });
            });
        }

        return issuesCount;
    }

    /**
     * Run Secrets scan async task and populate the given bundle with the results.
     * @param scanResults - the data object that will be populated with the results
     * @param root - the view object that will be populated with the results
     * @param scanManager - the ScanManager that preforms the actual scans
     * @param progressManager - the progress for the given scan
     */
    public static async runSecrets(
        scanResults: ScanResults,
        root: IssuesRootTreeNode,
        scanManager: ScanManager,
        progressManager: StepProgress
    ): Promise<void> {
        let startSecretsTime: number = Date.now();
        scanResults.secretsScan = await scanManager.scanSecrets(root.workSpace.uri.fsPath, progressManager.checkCancel);
        if (scanResults.secretsScan) {
            scanResults.secretsScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateSecretsIssues(root, scanResults);
            scanManager.logManager.logMessage(
                'Found ' +
                    issuesCount +
                    " Secret issues in workspace = '" +
                    scanResults.path +
                    "' (elapsed " +
                    (scanResults.secretsScanTimestamp - startSecretsTime) / 1000 +
                    ' seconds)',
                'INFO'
            );
            root.apply();
        }
        progressManager.reportProgress();
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
                        fileNode.issues.push(new SecretTreeNode(issue, location, fileNode));
                        issuesCount++;
                    });
                });
            });
        }

        return issuesCount;
    }

    /**
     * Create Eos scan request for each given package type supported by the scan.
     * Default will create request for all supported languages.
     * @param root - the root node of the workspace
     * @param languages - each supported language will generate a request
     * @returns list of Eos requests
     */
    private static createEosRequests(root: IssuesRootTreeNode, types?: PackageType[]): EosScanRequest[] {
        let languages: LanguageType[] = [];
        if (types) {
            types.forEach(type => {
                let language: LanguageType | undefined = Translators.toLanguageType(type);
                if (language) {
                    languages.push(language);
                }
            });
        }
        if (languages.length === 0) {
            // In case there are no descriptors to extract language from, add all.
            languages = EosRunner.supportedLanguages();
        }
        let requests: EosScanRequest[] = [];
        for (let language of languages) {
            requests.push({
                language: language,
                roots: [root.workSpace.uri.fsPath]
            } as EosScanRequest);
        }
        return requests;
    }

    /**
     *  Run Eos scan async task
     * @param workspaceData - the issues data for the workspace
     * @param root - the root node of the workspace
     * @param types - the packages types that were detected in the workspace
     * @param scanManager - the scan manager to use for scan
     * @param progressManager - the progress manager of the process for abort control
     */
    public static async runEos(
        workspaceData: ScanResults,
        root: IssuesRootTreeNode,
        types: PackageType[],
        scanManager: ScanManager,
        progressManager: StepProgress
    ): Promise<any> {
        let startTime: number = Date.now();
        workspaceData.eosScan = await scanManager.scanEos(progressManager.checkCancel, ...this.createEosRequests(root, types));
        if (workspaceData.eosScan) {
            workspaceData.eosScanTimestamp = Date.now();
            let applicableIssuesCount: number = AnalyzerUtils.populateEosIssues(root, workspaceData);
            scanManager.logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " Eos issues in workspace = '" +
                    workspaceData.path +
                    "' (elapsed " +
                    (workspaceData.eosScanTimestamp - startTime) / 1000 +
                    ' seconds)',
                'INFO'
            );

            root.apply();
            progressManager.reportProgress();
        }
    }

    /**
     * Populate eos information in the view
     * @param root - root node to populate data inside
     * @param workspaceData - data to populate on node
     * @returns number of eos issues populated
     */
    public static populateEosIssues(root: IssuesRootTreeNode, workspaceData: ScanResults): number {
        root.eosScanTimeStamp = workspaceData.eosScanTimestamp;
        let issuesCount: number = 0;
        if (workspaceData.eosScan && workspaceData.eosScan.filesWithIssues) {
            workspaceData.eosScan.filesWithIssues.forEach(fileWithIssues => {
                let fileNode: CodeFileTreeNode = this.getOrCreateCodeFileNode(root, fileWithIssues.full_path);
                fileWithIssues.issues.forEach((issue: EosIssue) => {
                    issue.locations.forEach((location: EosIssueLocation) => {
                        fileNode.issues.push(new EosTreeNode(issue, location, fileNode));
                        issuesCount++;
                    });
                });
            });
        }

        return issuesCount;
    }
}
