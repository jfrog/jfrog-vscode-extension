import * as path from 'path';
import { PackageType } from '../types/projectType';
import { ScanUtils } from './scanUtils';

export class IconsPaths {
    // Icons severities
    static readonly NORMAL_SEVERITY: string = IconsPaths.getIconPath('normal');
    static readonly PENDING_SEVERITY: string = IconsPaths.getSvgIconPath('Unknown');
    static readonly UNKNOWN_SEVERITY: string = IconsPaths.getSvgIconPath('Unknown');
    static readonly NOT_APPLICABLE_SEVERITY: string = IconsPaths.getSvgIconPath('Not_Applicable');
    static readonly NOT_APPLICABLE_UNKNOWN_SEVERITY: string = IconsPaths.getSvgIconPath('NotApplicableUnknown');
    static readonly NOT_APPLICABLE_LOW_SEVERITY: string = IconsPaths.getSvgIconPath('NotApplicableLow');
    static readonly NOT_APPLICABLE_MEDIUM_SEVERITY: string = IconsPaths.getSvgIconPath('NotApplicableMedium');
    static readonly NOT_APPLICABLE_HIGH_SEVERITY: string = IconsPaths.getSvgIconPath('NotApplicableHigh');
    static readonly NOT_APPLICABLE_CRITICAL_SEVERITY: string = IconsPaths.getSvgIconPath('NotApplicableCritical');
    static readonly INFORMATION_SEVERITY: string = IconsPaths.getSvgIconPath('Low');
    static readonly LOW_SEVERITY: string = IconsPaths.getSvgIconPath('Low');
    static readonly MEDIUM_SEVERITY: string = IconsPaths.getSvgIconPath('Medium');
    static readonly HIGH_SEVERITY: string = IconsPaths.getSvgIconPath('High');
    static readonly CRITICAL_SEVERITY: string = IconsPaths.getSvgIconPath('Critical');

    // Hover severities
    static readonly UNKNOWN_HOVER_SEVERITY: string = IconsPaths.getIconPath('unknownHover');
    static readonly LOW_HOVER_SEVERITY: string = IconsPaths.getIconPath('lowHover');
    static readonly MEDIUM_HOVER_SEVERITY: string = IconsPaths.getIconPath('mediumHover');
    static readonly HIGH_HOVER_SEVERITY: string = IconsPaths.getIconPath('highHover');
    static readonly CRITICAL_HOVER_SEVERITY: string = IconsPaths.getIconPath('criticalHover');

    // Icons builds status
    static readonly BUILD_SUCCESS: string = IconsPaths.getIconPath('normal');
    static readonly BUILD_FAILED: string = IconsPaths.getSvgIconPath('Critical');
    static readonly BUILD_UNKNOWN: string = IconsPaths.getSvgIconPath('Unknown');

    // License
    static readonly VIOLATED_LICENSE: string = IconsPaths.getIconPath('violatedLicense');

    // Icons for source code tree view.
    static readonly PYTHON: string = IconsPaths.getIconPath(path.join('package', 'pypi'));
    static readonly NPM: string = IconsPaths.getIconPath(path.join('package', 'npm'));

    public static getIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.png');
    }

    public static getSvgIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.svg');
    }
}

export class PackageDescriptorUtils {
    public static getIcon(packageType: PackageType): string | undefined {
        switch (packageType) {
            case PackageType.Python:
                return IconsPaths.PYTHON;
            case PackageType.Npm:
                return IconsPaths.NPM;
            default:
                return undefined;
        }
    }
}
