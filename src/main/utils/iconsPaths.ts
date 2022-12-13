import * as path from 'path';
import { PackageType } from '../types/projectType';
import { ScanUtils } from './scanUtils';

export class IconsPaths {
    // Icons severities
    static readonly NORMAL_SEVERITY: string = IconsPaths.getIconPath('normal');
    static readonly PENDING_SEVERITY: string = IconsPaths.getNewIconPath('Unknown');// IconsPaths.getIconPath('unknown');
    static readonly UNKNOWN_SEVERITY: string = IconsPaths.getNewIconPath('Unknown');// IconsPaths.getIconPath('unknown');
    static readonly INFORMATION_SEVERITY: string = IconsPaths.getNewIconPath('Low');// IconsPaths.getIconPath('low');
    static readonly LOW_SEVERITY: string = IconsPaths.getNewIconPath('Low');// IconsPaths.getIconPath('low');
    static readonly MEDIUM_SEVERITY: string = IconsPaths.getNewIconPath('Medium');// IconsPaths.getIconPath('medium');
    static readonly HIGH_SEVERITY: string = IconsPaths.getNewIconPath('High');// IconsPaths.getIconPath('high');
    static readonly CRITICAL_SEVERITY: string = IconsPaths.getNewIconPath('Critical');// IconsPaths.getIconPath('critical');

    // Hover severities
    static readonly UNKNOWN_HOVER_SEVERITY: string = IconsPaths.getIconPath('unknownHover');
    static readonly LOW_HOVER_SEVERITY: string = IconsPaths.getIconPath('lowHover');
    static readonly MEDIUM_HOVER_SEVERITY: string = IconsPaths.getIconPath('mediumHover');
    static readonly HIGH_HOVER_SEVERITY: string = IconsPaths.getIconPath('highHover');
    static readonly CRITICAL_HOVER_SEVERITY: string = IconsPaths.getIconPath('criticalHover');

    // Icons builds status
    static readonly BUILD_SUCCESS: string = IconsPaths.getIconPath('normal');
    static readonly BUILD_FAILED: string = IconsPaths.getIconPath('critical');
    static readonly BUILD_UNKNOWN: string = IconsPaths.getIconPath('unknown');

    // License
    static readonly VIOLATED_LICENSE: string = IconsPaths.getIconPath('violatedLicense');

    // Icons for source code tree view.
    static readonly PYTHON: string = IconsPaths.getIconPath(path.join('package', 'pypi'));
    static readonly NPM: string = IconsPaths.getIconPath(path.join('package', 'npm'));

    public static getIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.png');
    }

    public static getNewIconPath(iconName: string) {
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
