import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { IacFileIssues, IacIssue, IacRunner, IacScanResponse } from '../../../main/scanLogic/scanRunners/iacScan';
import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { NotSupportedError, ScanUtils } from '../../../main/utils/scanUtils';
import { FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { AnalyzerUtils } from '../../../main/treeDataProviders/utils/analyzerUtils';

describe('Iac Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'iacScan');

    let runner: IacRunner;
    let response: IacScanResponse;
    let expectedContent: IacScanResponse;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        runner = new IacRunner(
            integrationManager.connectionManager,
            ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            integrationManager.logManager,
            integrationManager.resource
        );
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected IacScanResponse content from ' + dataPath);
        // Run scan
        // Try/Catch (with skip) should be removed after Iac is released
        try {
            response = await runner.scan(testDataRoot, () => undefined);
        } catch (err) {
            if (err instanceof NotSupportedError) {
                this.skip();
            }
        }
    });

    function getTestFileIssues(filePath: string): IacFileIssues {
        let actualPath: string = AnalyzerUtils.parseLocationFilePath(filePath);
        let potential: IacFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === actualPath);
        if (!potential) {
            assert.fail('Response should contain file with issues at path ' + actualPath);
        }
        return potential;
    }

    function getTestIssue(filePath: string, ruleId: string): IacIssue {
        let fileWithIssues: IacFileIssues = getTestFileIssues(filePath);
        let potential: IacIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === ruleId);
        if (!potential) {
            assert.fail('Expected ' + ruleId + ' should be contain detected as issues of file ' + filePath);
        }
        return potential;
    }

    function getTestLocation(filePath: string, ruleId: string, location: FileRegion): FileRegion {
        let issue: IacIssue = getTestIssue(filePath, ruleId);
        let potential: FileRegion | undefined = issue.locations.find(actualLocation => AnalyzerUtils.isSameRegion(location, actualLocation));
        if (!potential) {
            assert.fail(
                'Expected file ' +
                    filePath +
                    ' should contain evidence for issue ' +
                    ruleId +
                    ' in location ' +
                    [location.startLine, location.endLine, location.startColumn, location.endColumn]
            );
        }
        return potential;
    }

    it('Check response defined', () => {
        assert.isDefined(response);
    });

    it('Check response attributes defined', () => {
        assert.isDefined(response.filesWithIssues);
    });

    it('Check all expected files with issues detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
            assert.isDefined(getTestFileIssues(expectedFileWithIssues.full_path));
        });
    });

    it('Check all expected issues detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
            expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                assert.isDefined(getTestIssue(expectedFileWithIssues.full_path, expectedIacIssues.ruleId));
            });
        });
    });

    it('Check all expected locations detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
            expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                    assert.isDefined(getTestLocation(expectedFileWithIssues.full_path, expectedIacIssues.ruleId, expectedLocation));
                });
            });
        });
    });

    describe('Detected issues validations', () => {
        it('Check rule-name', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                    assert.deepEqual(getTestIssue(expectedFileWithIssues.full_path, expectedIacIssues.ruleId).ruleName, expectedIacIssues.ruleName);
                });
            });
        });

        it('Check rule full description', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                    assert.deepEqual(
                        getTestIssue(expectedFileWithIssues.full_path, expectedIacIssues.ruleId).fullDescription,
                        expectedIacIssues.fullDescription
                    );
                });
            });
        });

        it('Check severity', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                    assert.deepEqual(getTestIssue(expectedFileWithIssues.full_path, expectedIacIssues.ruleId).severity, expectedIacIssues.severity);
                });
            });
        });

        it('Check snippet', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                    expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                        assert.deepEqual(
                            getTestLocation(expectedFileWithIssues.full_path, expectedIacIssues.ruleId, expectedLocation).snippet?.text,
                            expectedLocation.snippet?.text
                        );
                    });
                });
            });
        });
    });
});
