import { assert } from 'chai';
import * as fs from 'fs';
import { describe } from 'mocha';
import * as path from 'path';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';

import { AnalyzeScanRequest, AnalyzerScanRun, ScanType } from '../../main/scanLogic/scanRunners/analyzerModels';
import { JasRunner } from '../../main/scanLogic/scanRunners/jasRunner';
import { AppsConfigModule } from '../../main/utils/jfrogAppsConfig/jfrogAppsConfig';
import { NotEntitledError, ScanCancellationError, ScanUtils } from '../../main/utils/scanUtils';
import { Translators } from '../../main/utils/translators';
import { AnalyzerManager } from '../../main/scanLogic/scanRunners/analyzerManager';

// binary runner
describe('Analyzer BinaryRunner tests', async () => {
    let logManager: LogManager = new LogManager().activate();
    let connectionManager: ConnectionManager = createBinaryRunnerConnectionManager('url', 'username', 'pass', 'token');
    const dummyName: ScanType = ScanType.AnalyzeApplicability;

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
        dummyAction: () => Promise<void> = () => Promise.resolve()
    ): JasRunner {
        return new (class extends JasRunner {
            public scan(): Promise<void> {
                throw new Error('Method not implemented.');
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async runBinary(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _yamlConfigPath: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _executionLogDirectory: string | undefined,
                checkCancel: () => void
            ): Promise<void> {
                checkCancel();
                await dummyAction();
            }
        })(connection, dummyName, logManager, new AppsConfigModule(''), {} as AnalyzerManager);
    }

    function createDummyAnalyzerManager(
        connection: ConnectionManager = connectionManager,
        dummyAction: () => Promise<void> = () => Promise.resolve()
    ): AnalyzerManager {
        return new (class extends AnalyzerManager {
            public scan(): Promise<void> {
                throw new Error('Method not implemented.');
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async runBinary(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _yamlConfigPath: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _executionLogDirectory: string | undefined,
                checkCancel: () => void
            ): Promise<void> {
                checkCancel();
                await dummyAction();
            }
        })(connection, logManager);
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
            let runner: AnalyzerManager = createDummyAnalyzerManager(createBinaryRunnerConnectionManager(test.url, test.user, test.pass, test.token));
            process.env['HTTP_PROXY'] = test.proxy;
            process.env['HTTPS_PROXY'] = test.proxy;

            let envVars: NodeJS.ProcessEnv | undefined = runner.createEnvForRun(test.logPath);
            if (test.shouldFail) {
                assert.isUndefined(envVars);
            } else {
                assert.isDefined(envVars);
                // Validate platform vars
                assert.equal(envVars?.[AnalyzerManager.ENV_PLATFORM_URL] ?? '', test.url);
                assert.equal(envVars?.[AnalyzerManager.ENV_USER] ?? '', test.user);
                assert.equal(envVars?.[AnalyzerManager.ENV_PASSWORD] ?? '', test.pass);
                assert.equal(envVars?.[AnalyzerManager.ENV_TOKEN] ?? '', test.token);
                // Validate proxy vars
                if (test.proxy) {
                    assert.equal(envVars?.[AnalyzerManager.ENV_HTTP_PROXY], test.proxy);
                    assert.equal(envVars?.[AnalyzerManager.ENV_HTTPS_PROXY], test.proxy);
                }
                // Validate log vars
                assert.equal(envVars?.[AnalyzerManager.ENV_LOG_DIR], test.logPath);
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

    function getAnalyzeScanRequest(roots: string[], scanType: ScanType = ScanType.AnalyzeApplicability): AnalyzeScanRequest {
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
            createDummyResponse: true,
            shouldAbort: false,
            expectedErr: undefined
        },
        {
            name: 'Not entitled',
            createDummyResponse: true,
            shouldAbort: false,
            expectedErr: new NotEntitledError()
        },
        {
            name: 'Cancel requested',
            createDummyResponse: true,
            shouldAbort: true,
            expectedErr: new ScanCancellationError()
        },

        {
            name: 'Response not created',
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

            let runner: JasRunner = createDummyBinaryRunner(connectionManager, async () => {
                if (test.shouldAbort) {
                    throw new ScanCancellationError();
                } else if (test.name === 'Not entitled') {
                    throw new DummyRunnerError();
                }
                if (test.createDummyResponse) {
                    fs.writeFileSync(responsePath, JSON.stringify({} as AnalyzerScanRun));
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
    public code: number = JasRunner.NOT_ENTITLED;
}
