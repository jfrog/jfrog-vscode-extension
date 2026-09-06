import { assert } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { BuildsScanCache, Type } from '../../main/cache/buildsScanCache';
import { LogManager } from '../../main/log/logManager';
import { ScanUtils } from '../../main/utils/scanUtils';
import { Utils } from '../../main/utils/utils';

describe('CI cache ZIP encoding Tests', () => {
    const chineseDescription: string =
        '2021年12月9日，Apache Log4j2 爆出存在远程代码执行漏洞，由于该组件广泛应用在各个java程序中，影响范围极大，危害性很高，目前漏洞影响版本为2.0～2.14.1。请各位log4j2的用户抓紧排查影响范围，加以防范。';
    const scanResultsJson: string = JSON.stringify({
        build_name: 'zhl-vscode',
        build_number: '22',
        is_scan_completed: true,
        components: [
            {
                issues: [
                    {
                        issue_id: 'CustomIssue_ZHPtRSVKfrpV6X9x',
                        summary: 'my log4j custom issue',
                        description: chineseDescription
                    }
                ],
                operational_risks: [
                    {
                        component_id: 'gav://org.apache.logging.log4j:log4j-api:2.14.1',
                        is_eol: null,
                        eol_message: '',
                        latest_version: '3.0.0-beta2'
                    }
                ]
            }
        ]
    });

    it('Round-trip UTF-8 JSON through saveAsZip without truncating', () => {
        assert.isAbove(Buffer.byteLength(scanResultsJson, 'utf8'), scanResultsJson.length);

        const zipPath: string = path.join(ScanUtils.createTmpDir(), 'scan-results.zip');
        Utils.saveAsZip(zipPath, { fileName: Type.BUILD_SCAN_RESULTS.toString(), content: scanResultsJson });

        const extracted: string = Utils.extractZipEntry(zipPath, Type.BUILD_SCAN_RESULTS.toString());
        assert.equal(extracted, scanResultsJson);
        assert.deepEqual(JSON.parse(extracted), JSON.parse(scanResultsJson));
    });

    describe('BuildsScanCache', () => {
        const logManager: LogManager = new LogManager().activate();
        const cache: BuildsScanCache = new BuildsScanCache('rtfact-30873-test', 'https://example.invalid', logManager);
        const timestamp: string = '1786153130711';
        const buildName: string = 'zhl-vscode';
        const buildNumber: string = '22';
        const projectKey: string = '';

        afterEach(() => {
            [Type.BUILD_INFO, Type.BUILD_SCAN_RESULTS].forEach((type: Type) => {
                const zipPath: string = cache.getZipPath(timestamp, buildName, buildNumber, projectKey, type);
                if (fs.existsSync(zipPath)) {
                    fs.unlinkSync(zipPath);
                }
            });
        });

        it('Load complete scan results that include non-ASCII issue text', () => {
            cache.save(scanResultsJson, timestamp, buildName, buildNumber, projectKey, Type.BUILD_SCAN_RESULTS);

            const loaded: any = cache.loadScanResults(timestamp, buildName, buildNumber, projectKey);
            assert.isNotNull(loaded);
            assert.equal(loaded.components[0].issues[0].description, chineseDescription);
            assert.strictEqual(loaded.components[0].operational_risks[0].is_eol, null);
        });

        it('Treat truncated scan results JSON as a cache miss', () => {
            const truncated: string = scanResultsJson.slice(0, scanResultsJson.indexOf('"is_eol"') + '"is_eol"'.length);
            cache.save(truncated, timestamp, buildName, buildNumber, projectKey, Type.BUILD_SCAN_RESULTS);

            assert.isNull(cache.loadScanResults(timestamp, buildName, buildNumber, projectKey));
        });

        it('Treat truncated build info JSON as a cache miss', () => {
            cache.save('{"name":"zhl-vscode"', timestamp, buildName, buildNumber, projectKey, Type.BUILD_INFO);

            assert.isNull(cache.loadBuildInfo(timestamp, buildName, buildNumber, projectKey));
        });
    });
});
