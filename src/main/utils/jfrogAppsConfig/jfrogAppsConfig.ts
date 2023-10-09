import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import { ScanType } from '../../scanLogic/scanRunners/analyzerModels';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { ExcludeScannerName, JFrogAppsConfigSchema, Module, SastScanner, Scanner } from '../../types/jfrogAppsConfigSchema';
import { Configuration } from '../configuration';

export class JFrogAppsConfig {
    public static JFROG_APP_CONFIG_VERSION: string = '1.0';

    private _version: string = JFrogAppsConfig.JFROG_APP_CONFIG_VERSION;
    private _modules: AppsConfigModule[] = [];

    constructor(workspace: string) {
        let appConfigPath: string = path.join(workspace, '.jfrog', 'jfrog-apps-config.yml');
        if (fs.existsSync(appConfigPath)) {
            let jfrogAppsConfig: JFrogAppsConfigSchema = yaml.load(fs.readFileSync(appConfigPath, 'utf8')) as JFrogAppsConfigSchema;
            this._version = jfrogAppsConfig.version;
            if (jfrogAppsConfig.modules) {
                for (let module of jfrogAppsConfig.modules) {
                    this._modules.push(new AppsConfigModule(module));
                }
            }
        }
        // If no modules provides, push a default module
        if (this._modules.length === 0) {
            this._modules.push(new AppsConfigModule({ source_root: workspace } as Module));
        }
    }

    public get version(): string {
        return this._version;
    }

    public get modules(): AppsConfigModule[] {
        return this._modules;
    }
}

export class AppsConfigModule {
    private _name: string;
    private _sourceRoot: string;
    private _excludePatterns: string[];
    private _excludeScanners: ScanType[] = [];
    private _scanners: Map<ScanType, Scanner> = new Map<ScanType, Scanner>();

    constructor(module?: Module) {
        module = module || ({} as Module);
        this._name = module.name;
        this._sourceRoot = this.getModuleSourceRoot(module);
        this._excludePatterns = module.exclude_patterns || [];
        if (module.exclude_scanners) {
            for (let excludeScanner of module.exclude_scanners) {
                switch (excludeScanner) {
                    case ExcludeScannerName.Iac:
                        this._excludeScanners.push(ScanType.Iac);
                        break;
                    case ExcludeScannerName.Sast:
                        this._excludeScanners.push(ScanType.Sast);
                        break;
                    case ExcludeScannerName.Secrets:
                        this._excludeScanners.push(ScanType.Secrets);
                        break;
                    case ExcludeScannerName.ContextualAnalysis:
                        this._excludeScanners.push(ScanType.ContextualAnalysis);
                }
            }
        }
        this._excludeScanners = this.getModuleExcludeScanners(module);
        this._scanners.set(ScanType.Iac, module.scanners?.iac);
        this._scanners.set(ScanType.Sast, module.scanners?.sast);
        this._scanners.set(ScanType.Secrets, module.scanners?.secrets);
    }

    public get name(): string {
        return this._name;
    }

    public get sourceRoot(): string {
        return this._sourceRoot;
    }

    public get excludePatterns(): string[] {
        return this._excludePatterns;
    }

    public get excludeScanners(): ScanType[] {
        return this._excludeScanners;
    }

    public ShouldSkipScanner(scanType: ScanType): boolean {
        return this._excludeScanners.includes(scanType);
    }

    public GetSourceRoots(scanType: ScanType): string[] {
        let scanner: Scanner = this._scanners.get(scanType) || ({} as Scanner);
        if (!scanner.working_dirs) {
            return [this._sourceRoot];
        }
        let roots: string[] = [];
        for (let workingDir of scanner.working_dirs) {
            roots.push(path.join(this._sourceRoot, workingDir));
        }
        return roots;
    }

    public GetExcludePatterns(scanType: ScanType): string[] {
        let scanner: Scanner = this._scanners.get(scanType) || ({} as Scanner);
        let excludePatterns: string[] = this._excludePatterns || [];
        if (scanner && scanner.exclude_patterns) {
            excludePatterns = excludePatterns.concat(scanner.exclude_patterns);
        }
        if (excludePatterns.length === 0) {
            return AnalyzerUtils.getAnalyzerManagerExcludePatterns(Configuration.getScanExcludePattern());
        }
        return excludePatterns;
    }

    public GetScanLanguage(): string {
        let scanner: SastScanner = <SastScanner>this._scanners.get(ScanType.Sast) || ({} as SastScanner);
        return scanner.language;
    }

    public getExcludeRules(): string[] {
        let scanner: SastScanner = <SastScanner>this._scanners.get(ScanType.Sast) || ({} as SastScanner);
        return scanner.excluded_rules;
    }

    private getModuleSourceRoot(module: Module) {
        let sourceRoot: string = module.source_root || '';
        if (path.isAbsolute(sourceRoot)) {
            return sourceRoot;
        } else {
            return path.join(__dirname, sourceRoot);
        }
    }

    private getModuleExcludeScanners(module: Module): ScanType[] {
        if (!module.exclude_scanners) {
            return [];
        }
        let excludeScanners: ScanType[] = [];
        for (let excludeScanner of module.exclude_scanners) {
            switch (excludeScanner) {
                case ExcludeScannerName.Iac:
                    excludeScanners.push(ScanType.Iac);
                    break;
                case ExcludeScannerName.Sast:
                    excludeScanners.push(ScanType.Sast);
                    break;
                case ExcludeScannerName.Secrets:
                    excludeScanners.push(ScanType.Secrets);
                    break;
                case ExcludeScannerName.ContextualAnalysis:
                    excludeScanners.push(ScanType.ContextualAnalysis);
            }
        }
        return excludeScanners;
    }
}
