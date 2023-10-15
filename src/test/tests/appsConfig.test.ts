import { assert } from 'chai';
import * as path from 'path';
import { ScanType } from '../../main/scanLogic/scanRunners/analyzerModels';
import { ExcludeScannerName, Module, Scanner } from '../../main/types/jfrogAppsConfigSchema';
import { AppsConfigModule, JFrogAppsConfig } from '../../main/utils/jfrogAppsConfig/jfrogAppsConfig';

describe('JFrog Apps Config Tests', () => {
    const jfrogAppsConfigDir: string = path.join(__dirname, '..', 'resources', 'jfrogAppsConfig');

    it('Load full config', () => {
        // Load config
        let appsConfig: JFrogAppsConfig = new JFrogAppsConfig(jfrogAppsConfigDir);
        assert.isDefined(appsConfig);
        assert.equal(appsConfig?.version, '1.0');
        assert.lengthOf(appsConfig!.modules, 1);

        // Check module
        let module: AppsConfigModule = appsConfig!.modules[0];
        assert.equal(module.name, 'FrogLeapApp');
        assert.include(module.sourceRoot, path.join(jfrogAppsConfigDir, 'src'));
        assert.deepEqual(module.excludePatterns, ['docs/']);
        assert.deepEqual(module.excludeScanners, [ScanType.Secrets]);

        // Check scanners
        for (let scanType of [ScanType.Sast, ScanType.Iac, ScanType.Secrets]) {
            assert.include(module.GetSourceRoots(scanType)[0], 'dir1');
            assert.include(module.GetSourceRoots(scanType)[1], 'dir2');
            assert.deepEqual(module.GetExcludePatterns(scanType), ['docs/', 'dir1/test/**']);
        }

        // Check SAST scanner
        assert.equal(module.GetScanLanguage(), 'java');
        assert.deepEqual(module.getExcludeRules(), ['xss-injection']);
    });

    [
        { excludeScanners: undefined, shouldSkip: false },
        { excludeScanners: [] as ExcludeScannerName[], shouldSkip: false },
        { excludeScanners: [ExcludeScannerName.Iac] as ExcludeScannerName[], shouldSkip: false },
        { excludeScanners: [ExcludeScannerName.Iac, ExcludeScannerName.Sast] as ExcludeScannerName[], shouldSkip: false },
        { excludeScanners: [ExcludeScannerName.ContextualAnalysis] as ExcludeScannerName[], shouldSkip: true },
        { excludeScanners: [ExcludeScannerName.Secrets, ExcludeScannerName.ContextualAnalysis] as ExcludeScannerName[], shouldSkip: true }
    ].forEach(testCase => {
        it('Should skip scanner - ' + testCase.excludeScanners, () => {
            let module: AppsConfigModule = new AppsConfigModule('', { exclude_scanners: testCase.excludeScanners } as Module);
            assert.equal(module.ShouldSkipScanner(ScanType.AnalyzeApplicability), testCase.shouldSkip);
        });
    });

    let getSourceRootCases: AppConfigTest[] = [
        { scanner: undefined },
        { scanner: { working_dirs: ['working-dir'] } as Scanner },
        { scanner: { working_dirs: ['working-dir-1', 'working-dir-2'] } as Scanner }
    ];

    getSourceRootCases.forEach(testCase => {
        it('Get source roots - With module source - ' + testCase.scanner?.working_dirs, () => {
            let sourceRoot: string = path.join(__dirname, 'source-root');
            let module: AppsConfigModule = new AppsConfigModule(sourceRoot, {
                source_root: sourceRoot,
                scanners: { iac: testCase?.scanner }
            } as Module);
            let actualSourceRoots: string[] = module.GetSourceRoots(ScanType.Iac);
            if (!testCase.scanner) {
                assert.sameMembers(actualSourceRoots, [module.sourceRoot]);
                return;
            }
            let expectedWorkingDirs: string[] = [];
            for (let workingDir of testCase.scanner.working_dirs) {
                expectedWorkingDirs.push(path.join(module.sourceRoot, workingDir));
            }
            assert.sameMembers(actualSourceRoots, expectedWorkingDirs);
        });
    });

    getSourceRootCases.forEach(testCase => {
        it('Get source roots - With module source ' + testCase.scanner?.working_dirs, () => {
            let sourceRoot: string = path.join(__dirname, 'source-root');
            let module: AppsConfigModule = new AppsConfigModule(sourceRoot, { scanners: { iac: testCase?.scanner } } as Module);
            let actualSourceRoots: string[] = module.GetSourceRoots(ScanType.Iac);
            if (!testCase.scanner) {
                assert.sameMembers(actualSourceRoots, [module.sourceRoot]);
                return;
            }
            let expectedWorkingDirs: string[] = [];
            for (let workingDir of testCase.scanner.working_dirs) {
                expectedWorkingDirs.push(path.join(module.sourceRoot, workingDir));
            }
            assert.sameMembers(actualSourceRoots, expectedWorkingDirs);
        });
    });

    [
        { scanner: undefined },
        { scanner: { exclude_patterns: ['exclude-dir'] } as Scanner },
        { scanner: { exclude_patterns: ['exclude-dir-1', 'exclude-dir-2'] } as Scanner }
    ].forEach(testCase => {
        it('Get exclude patterns - ' + testCase.scanner?.exclude_patterns, () => {
            let module: AppsConfigModule = new AppsConfigModule('', {
                exclude_patterns: ['exclude-root'],
                scanners: { secrets: testCase?.scanner }
            } as Module);
            let actualExcludePatterns: string[] = module.GetExcludePatterns(ScanType.Secrets);
            if (!testCase.scanner) {
                assert.sameMembers(actualExcludePatterns, module.excludePatterns);
                return;
            }
            let expectedExcludePatterns: string[] = module.excludePatterns;
            expectedExcludePatterns = expectedExcludePatterns.concat(testCase.scanner.exclude_patterns);
            assert.sameMembers(actualExcludePatterns, expectedExcludePatterns);
        });
    });

    interface AppConfigTest {
        scanner: Scanner | undefined;
    }
});
