// import { ISeverityReasons } from 'jfrog-client-js';
import { /*ICve,*/ IDependencyPage, IImpactedPath, ILicense, IReference /*IResearch, ISeverity */ } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { IssueNode } from '../../issuesDataProvider';
import { IssueDependencyTreeNode } from './issueDependencyTreeNode';

export class CveTreeNode extends IssueNode {
    constructor(private _id: string, private _cve: string, private _severity: Severity, private _edited: string, private _parent: IssueDependencyTreeNode) {
        super(_cve, vscode.TreeItemCollapsibleState.None);
    }

    public get cve(): string {
        return this._cve;
    }

    public get severity(): Severity {
        return this._severity;
    }

    public get parent(): IssueDependencyTreeNode {
        return this._parent;
    }

    public asDetailsPage(): IDependencyPage {
        return {
            id: this._id,
            name: this._parent.name,
            type: PackageType[this._parent.type],
            version: this._parent.version,
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            edited: this._edited,
            summary: 'archiver tar.go untarFile() Function Tar File Unpacking Nested Symbolic Link Handling Arbitrary File Write',
            fixedVersion: this._parent.fixVersion,
            license: { name: 'license-name' } as ILicense,
            references: [
                {
                    text: 'text',
                    url: 'https://securitylab.github.com/advisories/GHSL-2020-252-zipslip-archiver'
                } as IReference,
                {
                    //text: "text",
                    url: 'https://github.com/mholt/archiver/commit/fea250ac6eacd56f90a82fbe2481cfdbb9a1bbd1'
                } as IReference
            ],
            researchInfo: undefined,
            // researchInfo: {
            //     shortDescription: "shortDescription",
            //     fullDescription: "fullDescription",
            //     remediation: "remediation",
            //     jfrogResearchSeverity: ISeverity.Unknown,
            //     jfrogResearchSeverityReason: [
            //         {
            //             name: "name",
            //             description: "description",
            //             isPositive: "isPositive",
            //         } as ISeverityReasons
            //     ],
            // } as IResearch,
            // impactedPath: this._parent.issueImpactPath,
            impactedPath: {
                name: 'Black',
                children: [
                    {
                        name: 'Aquamarine',
                        children: []
                    },
                    {
                        name: 'Cyan',
                        children: []
                    },
                    {
                        name: 'Navy',
                        children: []
                    },
                    {
                        name: 'Turquoise',
                        children: []
                    },
                    {
                        name: 'Green',
                        children: [
                            {
                                name: 'Purple',
                                children: [
                                    {
                                        name: 'Indigo',
                                        children: []
                                    },
                                    {
                                        name: 'Violet',
                                        children: []
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        name: 'Red',
                        children: [
                            {
                                name: 'Crimson',
                                children: []
                            },
                            {
                                name: 'Maroon',
                                children: []
                            },
                            {
                                name: 'Scarlet',
                                children: []
                            }
                        ]
                    },
                    {
                        name: 'White',
                        children: []
                    },
                    {
                        name: 'Yellow',
                        children: []
                    }
                ]
            } as IImpactedPath

            // cve: {
            //     id: "id",
            //     cvssV2Score: "cvssV2Score",
            //     cvssV2Vector: "cvssV2Vector",
            //     cvssV3Score: "cvssV3Score",
            //     cvssV3Vector: "cvssV3Vector",
            //     //applicably?: false;
            // } as ICve,
            // infectedVersion: ["infectedVersion"],
        } as IDependencyPage;
    }
}
