import * as semver from 'semver';
import { ScanUtils } from '../scanUtils';
import { Configuration } from '../configuration';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 *  Enum of npm cli flags
 */
export enum Flag {
    Version = ' --version',
    Json = ' --json',
    All = ' --all',
    PackageLockOnly = ' --package-lock-only',
    // Legacy for npm version 6
    LegacySkipDevDependencies = ' --prod',
    SkipDevDependencies = ' --omit=dev'
}
/**
 * The NpmCmd provides a wrapper to npm cli. Each public API, run a single npm cli command such as 'npm ls...'.
 */
export class NpmCmd {
    /**
     * @param projectRoot - The root npm project to run the command.
     * @param flags - Optional flags to the 'npm ci' command.
     */
    public static runNpmCi(projectRoot: string, flags?: string[]): any {
        ScanUtils.executeCmd('npm ci ' + flags?.join(' '), projectRoot);
    }

    /**
     * @param projectRoot - The root npm project to run the command.
     */
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

    /**
     *  Only npm versions 7 and above should get --package-lock-only flag if node_modules dir does not exit.
     *  It is more accurate to use node_modules instead of package-lock.
     * @param projectRoot - Project root dir.
     * @returns npm --package-lock-only flag.
     */
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
