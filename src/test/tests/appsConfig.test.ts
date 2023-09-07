import { assert } from 'chai';
import * as path from 'path';
import { ExcludeScanner, JFrogAppsConfig, Module, SastScanner, Scanner } from '../../main/types/jfrogAppsConfig';
import { AppsConfigUtils } from '../../main/utils/appConfigUtils';

describe('JFrog Apps Config Tests', () => {
    const jfrogAppsConfigDir: string = path.join(__dirname, '..', 'resources', 'jfrogAppsConfig');

    it('Load full config', () => {
        // Load config
        let appsConfig: JFrogAppsConfig | undefined = AppsConfigUtils.LoadConfig(jfrogAppsConfigDir);
        assert.isDefined(appsConfig);
        assert.equal(appsConfig?.version, '1.0');
        assert.lengthOf(appsConfig!.modules, 1);

        // Check module
        let module: Module = appsConfig!.modules[0];
        assert.equal(module.name, 'FrogLeapApp');
        assert.equal(module.source_root, 'src');
        assert.deepEqual(module.exclude_patterns, ['docs/']);
        assert.deepEqual(module.exclude_scanners, ['secrets']);

        // Check SAST scanner
        let sast: SastScanner = module.scanners.sast;
        assert.equal(sast.language, 'java');
        assert.deepEqual(sast.working_dirs, ['dir1', 'dir2']);
        assert.deepEqual(sast.exclude_patterns, ['dir1/test/**']);
        assert.deepEqual(sast.excluded_rules, ['xss-injection']);

        // Check SAST scanner
        let secrets: Scanner = module.scanners.secrets;
        assert.deepEqual(secrets.working_dirs, ['dir1', 'dir2']);
        assert.deepEqual(secrets.exclude_patterns, ['dir1/test/**']);

        // Check IaC scanner
        let iac: Scanner = module.scanners.iac;
        assert.deepEqual(iac.working_dirs, ['dir1', 'dir2']);
        assert.deepEqual(iac.exclude_patterns, ['dir1/test/**']);
    });

    it('Should skip scanner', () => {
        [
            { excludeScanners: undefined, shouldSkip: false },
            { excludeScanners: [] as ExcludeScanner[], shouldSkip: false },
            { excludeScanners: [ExcludeScanner.Iac] as ExcludeScanner[], shouldSkip: false },
            { excludeScanners: [ExcludeScanner.Iac, ExcludeScanner.Sast] as ExcludeScanner[], shouldSkip: false },
            { excludeScanners: [ExcludeScanner.ContextualAnalysis] as ExcludeScanner[], shouldSkip: true },
            { excludeScanners: [ExcludeScanner.Secrets, ExcludeScanner.ContextualAnalysis] as ExcludeScanner[], shouldSkip: true }
        ].forEach(testCase => {
            assert.equal(
                AppsConfigUtils.ShouldSkipScanner({ exclude_scanners: testCase.excludeScanners } as Module, ExcludeScanner.ContextualAnalysis),
                testCase.shouldSkip
            );
        });
    });

    let getSourceRootCases: AppConfigTest[] = [
        { scanner: undefined },
        { scanner: { working_dirs: ['working-dir'] } as Scanner },
        { scanner: { working_dirs: ['working-dir-1', 'working-dir-2'] } as Scanner }
    ];

    it('Get source roots - With module source', () => {
        let sourceRoot: string = path.join(__dirname, 'source-root');
        let module: Module = { source_root: sourceRoot } as Module;
        getSourceRootCases.forEach(testCase => {
            let actualSourceRoots: string[] = AppsConfigUtils.GetSourceRoots(module, testCase.scanner);
            if (!testCase.scanner) {
                assert.sameMembers(actualSourceRoots, [module.source_root]);
                return;
            }
            let expectedWorkingDirs: string[] = [];
            for (let workingDir of testCase.scanner.working_dirs) {
                expectedWorkingDirs.push(path.join(module.source_root, workingDir));
            }
            assert.sameMembers(actualSourceRoots, expectedWorkingDirs);
        });
    });

    it('Get source roots - Without module source', () => {
        let sourceRoot: string = path.join(__dirname);
        let module: Module = { source_root: sourceRoot } as Module;
        getSourceRootCases.forEach(testCase => {
            let actualSourceRoots: string[] = AppsConfigUtils.GetSourceRoots(module, testCase.scanner);
            if (!testCase.scanner) {
                assert.sameMembers(actualSourceRoots, [module.source_root]);
                return;
            }
            let expectedWorkingDirs: string[] = [];
            for (let workingDir of testCase.scanner.working_dirs) {
                expectedWorkingDirs.push(path.join(module.source_root, workingDir));
            }
            assert.sameMembers(actualSourceRoots, expectedWorkingDirs);
        });
    });

    let getExcludePatternsCases: AppConfigTest[] = [
        { scanner: undefined },
        { scanner: { exclude_patterns: ['exclude-dir'] } as Scanner },
        { scanner: { exclude_patterns: ['exclude-dir-1', 'exclude-dir-2'] } as Scanner }
    ];

    it('Get exclude patterns', () => {
        let module: Module = { exclude_patterns: ['exclude-root'] } as Module;
        getExcludePatternsCases.forEach(testCase => {
            let actualExcludePatterns: string[] = AppsConfigUtils.GetExcludePatterns(module, testCase.scanner);
            if (!testCase.scanner) {
                assert.sameMembers(actualExcludePatterns, module.exclude_patterns);
                return;
            }
            let expectedExcludePatterns: string[] = module.exclude_patterns;
            expectedExcludePatterns = expectedExcludePatterns.concat(testCase.scanner.exclude_patterns);
            assert.sameMembers(actualExcludePatterns, expectedExcludePatterns);
        });
    });

    interface AppConfigTest {
        scanner: Scanner | undefined;
    }
});
