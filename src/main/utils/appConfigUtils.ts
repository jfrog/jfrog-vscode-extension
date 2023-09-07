import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import { AnalyzerUtils } from '../treeDataProviders/utils/analyzerUtils';
import { ExcludeScanner, JFrogAppsConfig, Module, Scanner } from '../types/jfrogAppsConfig';
import { Configuration } from './configuration';

export class AppsConfigUtils {
    public static JFROG_APP_CONFIG_VERSION: string = '1.0';

    public static LoadConfig(workspace: string): JFrogAppsConfig {
        let appConfigPath: string = path.join(workspace, '.jfrog', 'jfrog-apps-config.yml');
        if (!fs.existsSync(appConfigPath)) {
            return {
                version: AppsConfigUtils.JFROG_APP_CONFIG_VERSION,
                modules: [{ source_root: workspace } as Module]
            } as JFrogAppsConfig;
        }
        return yaml.load(fs.readFileSync(appConfigPath, 'utf8')) as JFrogAppsConfig;
    }

    public static ShouldSkipScanner(module: Module, scanType: ExcludeScanner): boolean {
        return !!module.exclude_scanners?.includes(scanType);
    }

    public static GetSourceRoots(module: Module, scanner: Scanner | undefined): string[] {
        let root: string;
        if (path.isAbsolute(module.source_root)) {
            root = module.source_root;
        } else {
            root = path.join(__dirname, module.source_root);
        }
        if (!scanner || !scanner.working_dirs) {
            return [root];
        }
        let roots: string[] = [];
        for (let workingDir of scanner.working_dirs) {
            roots.push(path.join(root, workingDir));
        }
        return roots;
    }

    public static GetExcludePatterns(module: Module, scanner: Scanner | undefined): string[] {
        let excludePatterns: string[] = module.exclude_patterns || [];
        if (scanner && scanner.exclude_patterns) {
            excludePatterns = excludePatterns.concat(scanner.exclude_patterns);
        }
        if (excludePatterns.length === 0) {
            return AnalyzerUtils.getAnalyzerManagerExcludePattern(Configuration.getScanExcludePattern());
        }
        return excludePatterns;
    }
}
