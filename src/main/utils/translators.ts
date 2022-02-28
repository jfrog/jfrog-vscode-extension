import { ICve, IGeneral, IIssue, ILicense, IVulnerableComponent, Severity as ClientSeverity } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import { GavGeneralInfo } from '../types/gavGeneralinfo';
import { GeneralInfo } from '../types/generalInfo';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { Severity } from '../types/severity';

export class Translators {
    public static toGeneralInfo(clientGeneral: IGeneral): GeneralInfo {
        let components: string[] = clientGeneral.component_id.split(':');
        return components.length === 2
            ? new GeneralInfo(components[0], components[1], [], clientGeneral.path, clientGeneral.pkg_type)
            : new GavGeneralInfo(components[0], components[1], components[2], [], clientGeneral.path, clientGeneral.pkg_type);
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

    private static toCves(clientCves: ICve[]): string[] {
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
}
