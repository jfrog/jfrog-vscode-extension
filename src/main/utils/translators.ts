import { IGeneral, IIssue, ILicense, IVulnerableComponent, Severity as ClientSeverity } from 'xray-client-js';
import { GeneralInfo } from '../types/generalInfo';
import { Issue } from '../types/issue';
import { License } from '../types/license';
import { Severity } from '../types/severity';

export class Translators {
    public static toGeneralInfo(clientGeneral: IGeneral): GeneralInfo {
        let components: string[] = clientGeneral.component_id.split(':');
        return new GeneralInfo(components[0], components[1], clientGeneral.path, clientGeneral.pkg_type);
    }

    public static toIssue(clientIssue: IIssue) {
        return new Issue(
            clientIssue.summary,
            Translators.toSeverity(clientIssue.severity),
            clientIssue.description,
            Translators.capitalize(clientIssue.issue_type),
            Translators.toFixedVersions(clientIssue.components)
        );
    }

    public static toSeverity(clientSeverity: ClientSeverity): Severity {
        switch (clientSeverity) {
            case 'Normal':
                return Severity.Normal;
            case 'Pending':
                return Severity.Pending;
            case 'Unknown':
                return Severity.Unknown;
            case 'Information':
                return Severity.Information;
            case 'Low':
                return Severity.Low;
            case 'Medium':
                return Severity.Medium;
            case 'High':
                return Severity.High;
        }
    }

    public static toLicense(clientLicense: ILicense): License {
        return new License(clientLicense.more_info_url, clientLicense.components, clientLicense.full_name, clientLicense.name);
    }

    private static toFixedVersions(vulnerableComponents: IVulnerableComponent[]): string[] {
        if (!vulnerableComponents) {
            return [];
        }
        let fixed_versions: string[] = [];
        vulnerableComponents
            .map(vulnerableComponent => vulnerableComponent.fixed_versions)
            .forEach(fixedVersion => (fixed_versions = fixed_versions.concat(fixedVersion)));
        return fixed_versions;
    }

    private static capitalize(str: string): string {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }
}
