import * as path from 'path';
import { ScanUtils } from './scanUtils';

export class IconsPaths {
    // Icons severities
    static readonly NORMAL_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'normal'));
    static readonly PENDING_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Unknown'));
    static readonly UNKNOWN_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Unknown'));
    static readonly NOT_APPLICABLE_UNKNOWN_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'notApplicableUnknown'));
    static readonly NOT_APPLICABLE_LOW_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'notApplicableLow'));
    static readonly NOT_APPLICABLE_MEDIUM_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'notApplicableMedium'));
    static readonly NOT_APPLICABLE_HIGH_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'notApplicableHigh'));
    static readonly NOT_APPLICABLE_CRITICAL_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'notApplicableCritical'));
    static readonly INFORMATION_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Low'));
    static readonly LOW_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Low'));
    static readonly MEDIUM_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Medium'));
    static readonly HIGH_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'High'));
    static readonly CRITICAL_SEVERITY: string = IconsPaths.getSvgIconPath(path.join('severities', 'Critical'));

    // Hover severities
    static readonly UNKNOWN_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'unknownHover'));
    static readonly LOW_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'lowHover'));
    static readonly MEDIUM_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'mediumHover'));
    static readonly HIGH_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'highHover'));
    static readonly CRITICAL_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'criticalHover'));

    // Icons builds status
    static readonly BUILD_SUCCESS: string = IconsPaths.getIconPath(path.join('severities', 'normal'));
    static readonly BUILD_FAILED: string = IconsPaths.getSvgIconPath(path.join('Critical', 'severities'));
    static readonly BUILD_UNKNOWN: string = IconsPaths.getSvgIconPath(path.join('Unknown', 'severities'));

    // License
    static readonly VIOLATED_LICENSE: string = IconsPaths.getIconPath('violatedLicense');

    public static getIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.png');
    }

    public static getSvgIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.svg');
    }
}
