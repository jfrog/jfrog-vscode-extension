import { IAnalysisStep, IZeroDayPage } from 'jfrog-ide-webview';
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
            header: "header",
            location: "location",
            description: "description", // can be undefined
            remediation: ["remediation1","remediation2"], // can be undefined
            foundText: "foundText", // can be undefined
            analysisStep: [
                {
                file: "file1",
                line: "line1"
            } as IAnalysisStep,
            {
                file: "file2",
                line: "line2"
            } as IAnalysisStep
        ]
        } as IZeroDayPage;
    }
}