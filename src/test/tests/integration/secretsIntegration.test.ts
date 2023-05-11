import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { NotSupportedError } from '../../../main/utils/scanUtils';
import { FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { AnalyzerUtils } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { SecretsFileIssues, SecretsIssue, SecretsRunner, SecretsScanResponse } from '../../../main/scanLogic/scanRunners/secretsScan';

describe('Secrets Scan Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'secretsScan');

    let runner: SecretsRunner;
    let response: SecretsScanResponse;
    let expectedContent: SecretsScanResponse;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        runner = new SecretsRunner(integrationManager.connectionManager, integrationManager.logManager, integrationManager.resource);
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected SecretsScanResponse content from ' + dataPath);
        // Run scan
        // Try/Catch (with skip) should be removed after Secrets scan is released
        try {
            response = await runner.scan(testDataRoot, () => undefined);
        } catch (err) {
            if (err instanceof NotSupportedError) {
                this.skip();
            }
            throw err;
        }
    });

    function getTestFileIssues(filePath: string): SecretsFileIssues {
        let actualPath: string = path.join(testDataRoot, filePath);
        let potential: SecretsFileIssues | undefined = response.filesWithIssues.find(
            fileWithIssues => AnalyzerUtils.parseLocationFilePath(fileWithIssues.full_path) === actualPath
        );
        assert.isDefined(potential, 'Response should contain file with issues at path ' + actualPath);
        return potential!;
    }

    function getTestIssue(filePath: string, ruleId: string): SecretsIssue {
        let fileWithIssues: SecretsFileIssues = getTestFileIssues(filePath);
        let potential: SecretsIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === ruleId);
        assert.isDefined(potential, 'Expected ' + ruleId + ' should be contain detected as issues of file ' + filePath);
        return potential!;
    }

    function getTestLocation(filePath: string, ruleId: string, location: FileRegion): FileRegion {
        let issue: SecretsIssue = getTestIssue(filePath, ruleId);
        let potential: FileRegion | undefined = issue.locations.find(actualLocation => AnalyzerUtils.isSameRegion(location, actualLocation));
        assert.isDefined(
            potential,
            'Expected file ' +
                filePath +
                ' should contain evidence for issue ' +
                ruleId +
                ' in location ' +
                [location.startLine, location.endLine, location.startColumn, location.endColumn]
        );
        return potential!;
    }

    it('Check response defined', () => {
        assert.isDefined(response);
    });

    it('Check response attributes defined', () => {
        assert.isDefined(response.filesWithIssues);
    });

    it('Check all expected files with issues detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
            assert.isDefined(getTestFileIssues(expectedFileWithIssues.full_path));
        });
    });

    it('Check all expected issues detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
            expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                assert.isDefined(getTestIssue(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId));
            });
        });
    });

    it('Check all expected locations detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
            expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                expectedSecretsIssues.locations.forEach((expectedLocation: FileRegion) => {
                    assert.isDefined(getTestLocation(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId, expectedLocation));
                });
            });
        });
    });

    describe('Detected issues validations', () => {
        it('Check rule-name', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                    assert.deepEqual(
                        getTestIssue(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId).ruleName,
                        expectedSecretsIssues.ruleName
                    );
                });
            });
        });

        it('Check rule full description', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                    assert.deepEqual(
                        getTestIssue(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId).fullDescription,
                        expectedSecretsIssues.fullDescription
                    );
                });
            });
        });

        it('Check severity', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                    assert.deepEqual(
                        getTestIssue(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId).severity,
                        expectedSecretsIssues.severity
                    );
                });
            });
        });

        it('Check snippet', () => {
            expectedContent.filesWithIssues.forEach((expectedFileWithIssues: SecretsFileIssues) => {
                expectedFileWithIssues.issues.forEach((expectedSecretsIssues: SecretsIssue) => {
                    expectedSecretsIssues.locations.forEach((expectedLocation: FileRegion) => {
                        assert.deepEqual(
                            getTestLocation(expectedFileWithIssues.full_path, expectedSecretsIssues.ruleId, expectedLocation).snippet?.text,
                            expectedLocation.snippet?.text
                        );
                    });
                });
            });
        });
    });
});
