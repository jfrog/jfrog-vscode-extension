import { IZeroDayPage } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { Severity } from '../../../types/severity';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from "./codeIssueTreeNode";





/**
 * Describe a Eos issue
 */
export class EosTreeNode extends CodeIssueTreeNode {
    
    constructor(issueId: string, parent: CodeFileTreeNode, regionWithIssue: vscode.Range, severity?: Severity) {
        super(issueId, parent, regionWithIssue, severity);
    }

    /**
     * Get the CVE details page of the issue
     */
    public getDetailsPage(): IZeroDayPage {
        return {
            header: string;
            location: string;
            description?: string;
            remediation?: string[];
            foundText?: string;
            analysisStep: [
                {
                file: string;
                line: string;
            } as IAnalysisStep
        ]IAnalysisStep[];
        } as IZeroDayPage;
    }
}