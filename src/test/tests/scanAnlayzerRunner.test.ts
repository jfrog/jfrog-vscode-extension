import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';
import { describe } from 'mocha';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';

import { AnalyzerScanResponse, ScanType, AnalyzeScanRequest } from '../../main/scanLogic/scanRunners/analyzerModels';
import { BinaryRunner } from '../../main/scanLogic/scanRunners/binaryRunner';
import { NotEntitledError, ScanCancellationError, ScanTimeoutError, ScanUtils } from '../../main/utils/scanUtils';
import { RunUtils } from '../../main/utils/runUtils';
import { Translators } from '../../main/utils/translators';

// binary runner
describe('Analyzer BinaryRunner tests', async () => {
    let logManager: LogManager = new LogManager().activate();
    let connectionManager: ConnectionManager = createBinaryRunnerConnectionManager('url', 'username', 'pass', 'token');
    const dummyName: ScanType = ScanType.ContextualAnalysis;

    function createBinaryRunnerConnectionManager(inputUrl: string, user: string, pass: string, token: string): ConnectionManager {
        return {
            get url() {
                return inputUrl;
            },
            get username() {
                return user;
            },
            get password() {
                return pass;
            },
            get accessToken() {
                return token;
            },
            areXrayCredentialsSet(): boolean {
                return !!(inputUrl && ((user && pass) || token));
            }
        } as ConnectionManager;
    }

    function createDummyBinaryRunner(
        connection: ConnectionManager = connectionManager,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
        dummyAction: () => Promise<void> = () => Promise.resolve()
    ): BinaryRunner {
        return new (class extends BinaryRunner {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async runBinary(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _yamlConfigPath: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _executionLogDirectory: string | undefined,
                checkCancel: () => void
            ): Promise<void> {
                await RunUtils.runWithTimeout(timeout, checkCancel, dummyAction());
            }
        })(connection, timeout, dummyName, logManager);
    }

    [
        {
            name: 'With password credentials',
            shouldFail: false,
            url: 'platformUrl',
            user: 'username',
            pass: 'password',
            token: '',
            proxy: undefined,
            logPath: undefined
        },
        {
            name: 'With access token credentials',
            shouldFail: false,
            url: 'platformUrl',
            user: '',
            pass: '',
            token: 'access-token',
            proxy: undefined,
            logPath: undefined
        },
        {
            name: 'With log path',
            shouldFail: false,
            url: 'platformUrl',
            user: '',
            pass: '',
            token: 'access-token',
            proxy: undefined,
            logPath: 'path/to/folder'
        },
        {
            name: 'With proxy env vars',
            shouldFail: false,
            url: 'platformUrl',
            user: '',
            pass: '',
            token: 'access-token',
            proxy: 'proxyUrlEnvVarValue',
            logPath: undefined
        },
        {
            name: 'Without Credentials - Error',
            shouldFail: true,
            url: '',
            user: '',
            pass: '',
            token: '',
            proxy: undefined,
            logPath: undefined
        }
    ].forEach(test => {
        it('Create environment variables for execution - ' + test.name, () => {
            //
            let runner: BinaryRunner = createDummyBinaryRunner(createBinaryRunnerConnectionManager(test.url, test.user, test.pass, test.token));
            process.env['HTTP_PROXY'] = test.proxy;
            process.env['HTTPS_PROXY'] = test.proxy;

            let envVars: NodeJS.ProcessEnv | undefined = runner.createEnvForRun(test.logPath);
            if (test.shouldFail) {
                assert.isUndefined(envVars);
            } else {
                assert.isDefined(envVars);
                // Validate platform vars
                assert.equal(envVars?.[BinaryRunner.ENV_PLATFORM_URL] ?? '', test.url);
                assert.equal(envVars?.[BinaryRunner.ENV_USER] ?? '', test.user);
                assert.equal(envVars?.[BinaryRunner.ENV_PASSWORD] ?? '', test.pass);
                assert.equal(envVars?.[BinaryRunner.ENV_TOKEN] ?? '', test.token);
                // Validate proxy vars
                if (test.proxy) {
                    assert.equal(envVars?.[BinaryRunner.ENV_HTTP_PROXY], test.proxy);
                    assert.equal(envVars?.[BinaryRunner.ENV_HTTPS_PROXY], test.proxy);
                }
                // Validate log vars
                assert.equal(envVars?.[BinaryRunner.ENV_LOG_DIR], test.logPath);
            }
        });
    });

    [
        {
            name: 'One root',
            roots: ['/path/to/root']
        },
        {
            name: 'Multiple roots',
            roots: ['/path/to/root', '/path/to/other']
        }
    ].forEach(test => {
        it('Generate Yaml request - ' + test.name, () => {
            let request: AnalyzeScanRequest = getAnalyzeScanRequest(test.roots);
            let expected: string = 'scans:\n' + '  - type: ' + request.type + '\n' + '    output: ' + request.output + '\n' + '    roots:\n';
            for (let root of test.roots) {
                expected += '      - ' + root + '\n';
            }
            expected += '    skipped-folders: []\n';
            assert.deepEqual(createDummyBinaryRunner().requestsToYaml(request), expected);
        });
    });

    function getAnalyzeScanRequest(roots: string[], scanType: ScanType = ScanType.ContextualAnalysis): AnalyzeScanRequest {
        return {
            type: scanType,
            output: '/path/to/output.json',
            roots: roots,
            skipped_folders: []
        };
    }

    [
        {
            name: 'Run valid request',
            timeout: ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            createDummyResponse: true,
            shouldAbort: false,
            expectedErr: undefined
        },
        {
            name: 'Not entitled',
            timeout: ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            createDummyResponse: true,
            shouldAbort: false,
            expectedErr: new NotEntitledError()
        },
        {
            name: 'Cancel requested',
            timeout: ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            createDummyResponse: true,
            shouldAbort: true,
            expectedErr: new ScanCancellationError()
        },
        {
            name: 'Timeout',
            timeout: 1,
            createDummyResponse: true,
            shouldAbort: false,
            expectedErr: new ScanTimeoutError('' + 1, 1)
        },
        {
            name: 'Response not created',
            timeout: ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            createDummyResponse: false,
            shouldAbort: false,
            expectedErr: new Error(
                "Running '" + Translators.toAnalyzerTypeString(dummyName) + "' binary didn't produce response.\nRequest: request data"
            )
        }
    ].forEach(async test => {
        it('Run request - ' + test.name, async () => {
            let tempFolder: string = ScanUtils.createTmpDir();
            let requestPath: string = path.join(tempFolder, 'request');
            let responsePath: string = path.join(tempFolder, 'response');

            let runner: BinaryRunner = createDummyBinaryRunner(connectionManager, test.timeout, async () => {
                if (test.shouldAbort) {
                    throw new ScanCancellationError();
                } else if (test.name === 'Not entitled') {
                    throw new DummyRunnerError();
                } else if (test.name === 'Timeout') {
                    await RunUtils.delay(ScanUtils.ANALYZER_TIMEOUT_MILLISECS);
                }
                if (test.createDummyResponse) {
                    fs.writeFileSync(responsePath, JSON.stringify({ runs: [] } as AnalyzerScanResponse));
                }
            });

            if (test.expectedErr) {
                try {
                    await runner.runRequest(() => undefined, 'request data', requestPath, responsePath);
                    assert.fail('Expected run to throw error');
                } catch (err) {
                    if (err instanceof Error) {
                        assert.equal(err.message, test.expectedErr.message);
                    } else {
                        assert.fail('Expected run to throw Error but got ' + err);
                    }
                }
            } else {
                assert.doesNotThrow(async () => await runner.runRequest(() => undefined, 'request data', requestPath, responsePath));
            }
        });
    });
});

class DummyRunnerError extends Error {
    public code: number = BinaryRunner.NOT_ENTITLED;
}
