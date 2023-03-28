import * as semver from 'semver';
import { ScanUtils } from '../scanUtils';
import { Configuration } from '../configuration';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export enum Flag {
    Version = ' --version',
    Json = ' --json',
    All = ' --all',
    PackageLockOnly = ' --package-lock-only',
    // Legacy for npm version 6
    LegacySkipDevDependencies = ' --prod',
    SkipDevDependencies = ' --omit=dev'
}

export class NpmCmd {
    public static runNpmCi(workspaceFolder: string): any {
        ScanUtils.executeCmd('npm ci', workspaceFolder);
    }

    public static runNpmLs(workspaceFolder: string): any {
        return JSON.parse(ScanUtils.executeCmd('npm ls' + this.getNpmLsArgs(workspaceFolder), workspaceFolder).toString());
    }

    public static runNpmVersion(): string {
        return execSync(`npm ${Flag.Version}`).toString();
    }

    protected static isLegacyNpmVersion(): boolean {
        let version: string = this.runNpmVersion();
        let npmSemver: semver.SemVer = new semver.SemVer(version);
        return npmSemver.compare('7.0.0') === -1;
    }

    protected static getNpmLsArgs(workspaceFolder: string): string {
        let args: string = `${Flag.Json} ${Flag.All}`;
        args += this.getSkipDevDependenciesFlag(this.isLegacyNpmVersion());
        return args + this.getPackageLockOnlyFlag(workspaceFolder);
    }

    protected static getSkipDevDependenciesFlag(isLegacyNpm: boolean) {
        if (!Configuration.excludeDevDependencies()) {
            return '';
        }
        return isLegacyNpm ? Flag.LegacySkipDevDependencies : Flag.SkipDevDependencies;
    }

    protected static getPackageLockOnlyFlag(workspaceFolder: string) {
        if (!this.isNodeModulesExists(workspaceFolder)) {
            return Flag.PackageLockOnly;
        }
        return '';
    }

    protected static isNodeModulesExists(workspaceFolder: string) {
        return fs.existsSync(path.join(workspaceFolder, 'node_modules'));
    }
}
