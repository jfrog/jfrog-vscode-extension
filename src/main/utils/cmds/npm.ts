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
    public static runNpmCi(projectRoot: string): any {
        ScanUtils.executeCmd('npm ci', projectRoot);
    }

    public static runNpmLs(projectRoot: string): any {
        return JSON.parse(ScanUtils.executeCmd('npm ls' + this.getNpmLsArgs(projectRoot), projectRoot).toString());
    }

    public static runNpmVersion(): string {
        return execSync(`npm ${Flag.Version}`).toString();
    }

    public static isLegacyNpmVersion(): boolean {
        let version: string = this.runNpmVersion();
        let npmSemver: semver.SemVer = new semver.SemVer(version);
        return npmSemver.compare('7.0.0') === -1;
    }

    protected static getNpmLsArgs(projectRoot: string): string {
        let args: string = `${Flag.Json} ${Flag.All}`;
        args += this.getSkipDevDependenciesFlag();
        return args + this.getPackageLockOnlyFlag(projectRoot);
    }

    protected static getSkipDevDependenciesFlag() {
        if (!Configuration.excludeDevDependencies()) {
            return '';
        }
        return this.isLegacyNpmVersion() ? Flag.LegacySkipDevDependencies : Flag.SkipDevDependencies;
    }

    protected static getPackageLockOnlyFlag(projectRoot: string) {
        if (this.isNodeModulesExists(projectRoot)) {
            return '';
        }
        if (this.isLegacyNpmVersion()) {
            return '';
        }
        return Flag.PackageLockOnly;
    }

    protected static isNodeModulesExists(projectRoot: string) {
        return fs.existsSync(path.join(projectRoot, 'node_modules'));
    }
}
