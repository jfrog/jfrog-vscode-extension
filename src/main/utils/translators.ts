import {
    ICve,
    IGeneral,
    IIssue,
    ILicense,
    IVulnerableComponent,
    Severity as ClientSeverity,
    IReference,
    IExtendedInformation,
    IGraphCve
} from 'jfrog-client-js';
import { IExtendedInformation as WebExtendedInformation, ISeverityReasons, ICve as WebICve, IAnalysisStep } from 'jfrog-ide-webview';
import Set from 'typescript-collections/dist/lib/Set';
import { IApplicableDetails } from 'jfrog-ide-webview';
import { GavGeneralInfo } from '../types/gavGeneralinfo';
import { GeneralInfo } from '../types/generalInfo';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { Severity } from '../types/severity';
import { FileLocation } from '../scanLogic/scanRunners/analyzerModels';
import { toPackageType } from '../types/projectType';
import { Utils } from './utils';

export class Translators {
    public static toAnalyzerLogLevel(logLevel: string): string {
        if (logLevel === 'warn' || logLevel === 'err') {
            return 'error';
        }
        return logLevel;
    }

    public static toGeneralInfo(clientGeneral: IGeneral): GeneralInfo {
        let components: string[] = clientGeneral.component_id.split(':');
        return components.length === 2
            ? new GeneralInfo(components[0], components[1], [], clientGeneral.path, toPackageType(clientGeneral.pkg_type))
            : new GavGeneralInfo(components[0], components[1], components[2], [], clientGeneral.path, toPackageType(clientGeneral.pkg_type));
    }

    public static toCacheIssue(clientIssue: IIssue): IIssueCacheObject {
        return {
            issueId: clientIssue.issue_id,
            summary: clientIssue.summary,
            severity: Translators.toSeverity(clientIssue.severity),
            cves: Translators.toCves(clientIssue.cves),
            fixedVersions: Translators.toFixedVersions(clientIssue.components)
        } as IIssueCacheObject;
    }

    public static toSeverity(clientSeverity: ClientSeverity | string): Severity {
        switch (clientSeverity) {
            case 'Normal':
                return Severity.Normal;
            case 'Pending':
                return Severity.Pending;
            case 'Information':
                return Severity.Information;
            case 'Low':
                return Severity.Low;
            case 'Medium':
                return Severity.Medium;
            case 'High':
                return Severity.High;
            case 'Critical':
                return Severity.Critical;
            default:
                return Severity.Unknown;
        }
    }

    public static toCacheLicense(clientLicense: ILicense): ILicenseCacheObject {
        return {
            name: clientLicense.name,
            fullName: clientLicense.full_name,
            moreInfoUrl: clientLicense.more_info_url && clientLicense.more_info_url.length > 0 ? clientLicense.more_info_url[0] : ''
        } as ILicenseCacheObject;
    }

    public static toCves(clientCves: ICve[]): string[] {
        let cves: string[] = [];
        if (clientCves) {
            clientCves
                .filter(cve => cve.cve)
                .forEach(cve => {
                    if (!!cve.cve) {
                        cves.push(cve.cve);
                    }
                });
        }
        return cves;
    }

    private static toFixedVersions(vulnerableComponents: IVulnerableComponent[]): string[] {
        if (!vulnerableComponents) {
            return [];
        }
        let fixed_versions: Set<string> = new Set();
        vulnerableComponents
            .map(vulnerableComponent => vulnerableComponent.fixed_versions)
            .reduce((acc, val) => acc.concat(val), []) // Flatten the array and filter falsy values
            .forEach(fixedVersion => fixed_versions.add(fixedVersion));
        return fixed_versions.toArray();
    }

    public static capitalize(str: string): string {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    public static cleanReferencesLink(references: string[] | undefined): IReference[] {
        let results: IReference[] = [];
        if (!references) {
            return results;
        }
        for (let reference of references) {
            // A single reference may includes multiples links separated by \n
            if (reference.includes('\n')) {
                results.push(...this.cleanReferencesLink(reference.split('\n')));
                continue;
            }
            // The format of some references is [text](link-url).
            let openBracket: number = reference.indexOf('(');
            let closeSquareBracket: number = reference.indexOf(']');
            if (openBracket != -1) {
                // Extract the URL.
                const url: string = reference.slice(openBracket + 1, reference.length - 1);
                const text: string = reference.slice(1, closeSquareBracket);
                results.push({ text: text, url: url } as IReference);
                continue;
            }
            results.push({ url: reference } as IReference);
        }
        return results;
    }

    static toWebViewICve(cve?: IGraphCve, applicableDetails?: IApplicableDetails): WebICve | undefined {
        if (cve || applicableDetails) {
            return {
                id: cve?.cve,
                cvssV2Score: cve?.cvss_v2_score,
                cvssV2Vector: cve?.cvss_v2_vector,
                cvssV3Score: cve?.cvss_v3_score,
                cvssV3Vector: cve?.cvss_v3_vector,
                applicableData: applicableDetails
            } as WebICve;
        }
        return undefined;
    }

    static toAnalysisSteps(threadFlows: FileLocation[][]): IAnalysisStep[][] {
        if (!threadFlows || threadFlows.length === 0) {
            return [];
        }
        let result: IAnalysisStep[][] = [];
        for (let locations of threadFlows) {
            let codeFlow: IAnalysisStep[] = [];
            for (let location of locations) {
                codeFlow.push({
                    fileName: Utils.getLastSegment(location.artifactLocation.uri),
                    file: location.artifactLocation.uri,
                    row: location.region.startLine,
                    column: location.region.startColumn
                } as IAnalysisStep);
            }
            result.push(codeFlow);
        }
        return result;
    }

    public static toWebViewExtendedInformation(extended_information: IExtendedInformation): WebExtendedInformation {
        let extendedInfo: WebExtendedInformation = {
            shortDescription: extended_information.short_description,
            fullDescription: extended_information.full_description,
            remediation: extended_information.remediation,
            jfrogResearchSeverity: extended_information.jfrog_research_severity,
            jfrogResearchSeverityReason: []
        } as WebExtendedInformation;

        extended_information.jfrog_research_severity_reasons?.forEach(reason =>
            extendedInfo.jfrogResearchSeverityReason?.push({
                name: reason.name,
                description: reason.description,
                isPositive: reason.is_positive
            } as ISeverityReasons)
        );

        return extendedInfo;
    }

    public static cleanVersionParentheses(version: string) {
        return version.replace(/[\][]/g, '');
    }
}
