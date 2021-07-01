import * as Collections from 'typescript-collections';
import { ICve, IGeneral, IIssue, ILicense, IVulnerableComponent, Severity as ClientSeverity } from 'jfrog-client-js';
import { GavGeneralInfo } from '../types/gavGeneralinfo';
import { GeneralInfo } from '../types/generalInfo';
import { Issue } from '../types/issue';
import { License } from '../types/license';
import { Severity } from '../types/severity';

export class Translators {
    public static toGeneralInfo(clientGeneral: IGeneral): GeneralInfo {
        let components: string[] = clientGeneral.component_id.split(':');
        return components.length === 2
            ? new GeneralInfo(components[0], components[1], [], clientGeneral.path, clientGeneral.pkg_type)
            : new GavGeneralInfo(components[0], components[1], components[2], [], clientGeneral.path, clientGeneral.pkg_type);
    }

    public static toIssue(clientIssue: IIssue): Issue {
        return new Issue(
            clientIssue.summary,
            Translators.toSeverity(clientIssue.severity),
            clientIssue.description,
            Translators.capitalize(clientIssue.issue_type),
            Translators.toFixedVersions(clientIssue.components),
            Translators.toCves(clientIssue.cves)
        );
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
            default:
                return Severity.Unknown;
        }
    }

    public static toLicense(clientLicense: ILicense): License {
        return new License(clientLicense.more_info_url, clientLicense.components, clientLicense.full_name, clientLicense.name);
    }

    public static stringToLicense(clientLicense: string): License {
        return new License([], [], '', clientLicense);
    }

    private static toCves(clientCves: ICve[]): string[] {
        let cves: string[] = [];
        if (clientCves) {
            clientCves.filter(cve => cve.cve).forEach(cve => cves.push(cve.cve));
        }
        return cves;
    }

    private static toFixedVersions(vulnerableComponents: IVulnerableComponent[]): string[] {
        if (!vulnerableComponents) {
            return [];
        }
        let fixed_versions: Collections.Set<string> = new Collections.Set();
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
