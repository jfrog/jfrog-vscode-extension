import { execSync } from 'child_process';
import { IJfrogClientConfig, IProxyConfig } from 'jfrog-client-js';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager, LoginStatus } from '../../main/connect/connectionManager';
import { ConnectionUtils } from '../../main/connect/connectionUtils';
import { LogManager } from '../../main/log/logManager';
import { createTestConnectionManager, getCliHomeDir, setCliHomeDir } from './utils/utils.test';
import { assert } from 'chai';
import sinon from 'sinon';
import { SessionStatus } from '../../main/constants/contextKeys';

describe('Connection Manager Tests', () => {
    let connectionManager: ConnectionManager;
    before(async () => {
        // Don't override existing connection details
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';

        connectionManager = await createTestConnectionManager(new LogManager().activate(), 45000, 100);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('User agent header', () => {
        let clientConfig: IJfrogClientConfig = {
            headers: {}
        } as IJfrogClientConfig;

        ConnectionUtils.addUserAgentHeader(clientConfig);
        let userAgent: string | undefined = clientConfig.headers!['User-Agent'];
        assert.isDefined(userAgent);
        assert.match(userAgent, new RegExp(/^jfrog-vscode-extension\/\d+.\d+.\d+$/));
    });

    it('Proxy authorization header', async () => {
        let clientConfig: IJfrogClientConfig = {
            headers: {},
            proxy: {} as IProxyConfig
        } as IJfrogClientConfig;

        await vscode.workspace.getConfiguration().update('http.proxyAuthorization', 'testProxyAuthorization', true);
        ConnectionUtils.addProxyAuthHeader(clientConfig);
        let proxyAuthorization: string | undefined = clientConfig.headers!['Proxy-Authorization'];
        assert.isDefined(proxyAuthorization);
        assert.deepEqual(proxyAuthorization, 'testProxyAuthorization');
    });

    describe('Populate credentials from env', async () => {
        [
            {
                inputUrl: 'https://httpbin.org/anything',
                expectedPlatformUrl: 'https://httpbin.org/anything',
                expectedXrayUrl: 'https://httpbin.org/anything/xray'
            },
            {
                inputUrl: 'https://httpbin.org/anything/',
                expectedPlatformUrl: 'https://httpbin.org/anything/',
                expectedXrayUrl: 'https://httpbin.org/anything/xray'
            },
            {
                inputUrl: 'https://httpbin.org/anything/xray',
                expectedPlatformUrl: 'https://httpbin.org/anything',
                expectedXrayUrl: 'https://httpbin.org/anything/xray'
            },
            {
                inputUrl: 'https://httpbin.org/anything/xray/',
                expectedPlatformUrl: 'https://httpbin.org/anything',
                expectedXrayUrl: 'https://httpbin.org/anything/xray/'
            },
            {
                inputUrl: 'https://httpbin.org/status/404/different-xray-url',
                expectedPlatformUrl: '',
                expectedXrayUrl: 'https://httpbin.org/status/404/different-xray-url'
            },
            {
                inputUrl: 'https://httpbin.org/status/404/different-xray-url/',
                expectedPlatformUrl: '',
                expectedXrayUrl: 'https://httpbin.org/status/404/different-xray-url/'
            }
        ].forEach(async testCase => {
            it('Input URL: ' + testCase.inputUrl, async () => {
                // Clean up env before tests.
                process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[
                    ConnectionManager.ACCESS_TOKEN_ENV
                ] = process.env[ConnectionManager.URL_ENV] = '';

                // Store previous CLI home, and set to a non existing path so no credentials will be read from the CLI.
                const previousHome: string = getCliHomeDir();
                setCliHomeDir(path.resolve('/path/to/nowhere'));

                // Check credentials not set.
                assert.isEmpty(await connectionManager.tryGetUrlFromJFrogCli());
                assert.isFalse(connectionManager.areXrayCredentialsSet());

                await populateCredsAndAssert(testCase, 'admin', 'password', '');
                await populateCredsAndAssert(testCase, '', '', 'token');

                // Restore old CLI home dir.
                setCliHomeDir(previousHome);
                connectionManager.deleteCredentialsFromMemory();
            });
        });
    });

    async function populateCredsAndAssert(testCase: any, user: string, pass: string, token: string) {
        process.env[ConnectionManager.URL_ENV] = testCase.inputUrl;
        process.env[ConnectionManager.USERNAME_ENV] = user;
        process.env[ConnectionManager.PASSWORD_ENV] = pass;
        process.env[ConnectionManager.ACCESS_TOKEN_ENV] = token;

        assert.isTrue(await connectionManager.getCredentialsFromEnv());
        assert.isTrue(connectionManager.areXrayCredentialsSet());
        assert.equal(connectionManager.url, testCase.expectedPlatformUrl);
        assert.equal(connectionManager.xrayUrl, testCase.expectedXrayUrl);
        assert.equal(connectionManager.username, user);
        assert.equal(connectionManager.password, pass);
        assert.equal(connectionManager.accessToken, token);
    }

    describe('Read credentials from JFrog CLI', async () => {
        [
            {
                serverId: 'basic-auth-only',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: 'username',
                expectedPassword: 'pass',
                expectedAccessToken: '',
                expectedResult: true
            },
            {
                serverId: 'access-token-only',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: '',
                expectedPassword: '',
                expectedAccessToken: 'token',
                expectedResult: true
            },
            {
                serverId: 'with-refresh-token',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: 'username',
                expectedPassword: 'pass',
                expectedAccessToken: '',
                expectedResult: true
            },
            {
                serverId: 'empty-creds',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: '',
                expectedPassword: '',
                expectedAccessToken: '',
                expectedResult: false
            }
        ].forEach(async testCase => {
            it('Credentials type: ' + testCase.serverId, async () => {
                // Make sure credentials are not set from env.
                process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[
                    ConnectionManager.ACCESS_TOKEN_ENV
                ] = process.env[ConnectionManager.URL_ENV] = '';

                // Store previous CLI home, and set new one to test data.
                const previousHome: string = getCliHomeDir();
                setCliHomeDir('/path/to/nowhere');

                // Assert credentials are empty.
                assert.isEmpty(await connectionManager.tryGetUrlFromJFrogCli());
                assert.isFalse(connectionManager.areCompleteCredentialsSet());

                // Set new home to test data.
                setCliHomeDir(path.join(__dirname, '..', 'resources', 'cliHome'));

                // Use the corresponding server-id to the test case.
                assert.doesNotThrow(() => execSync('jf c use ' + testCase.serverId.trim()));

                assert.equal(await connectionManager.readCredentialsFromJfrogCli(), testCase.expectedResult);
                assert.equal(connectionManager.url, testCase.expectedPlatformUrl);
                assert.equal(connectionManager.rtUrl, testCase.expectedRtUrl);
                assert.equal(connectionManager.xrayUrl, testCase.expectedXrayUrl);
                assert.equal(connectionManager.username, testCase.expectedUsername);
                assert.equal(connectionManager.password, testCase.expectedPassword);
                assert.equal(connectionManager.accessToken, testCase.expectedAccessToken);

                // Restore old CLI home dir.
                setCliHomeDir(previousHome);
                connectionManager.deleteCredentialsFromMemory();
            });
        });
    });

    const mockLogger: LogManager = new LogManager().activate();
    const mockConnectionManager: ConnectionManager = new ConnectionManager(mockLogger);
    describe('Read from KeyStore', () => {
        let logMessageStub: sinon.SinonStub<any, void>;
        let setUrlsFromFilesystemStub: sinon.SinonStub<any, Promise<boolean>>;
        let setUsernameFromFilesystemStub: sinon.SinonStub<any, Promise<boolean>>;
        let getPasswordFromSecretStorageStub: sinon.SinonStub<any, Promise<boolean>>;
        let getAccessTokenFromSecretStorageStub: sinon.SinonStub<any, Promise<boolean>>;
        let deleteCredentialsFromMemoryStub: sinon.SinonStub<any[], any>;
        let resolveUrlsStub: sinon.SinonStub<any, Promise<void>>;
        let onSuccessConnectStub: sinon.SinonStub<any, Promise<void>>;

        beforeEach(() => {
            logMessageStub = sinon.stub(mockLogger, 'logMessage');
            //By casting mockConnectionManager to any, we can access and stub the private function.
            setUrlsFromFilesystemStub = sinon.stub(mockConnectionManager as any, 'setUrlsFromFilesystem').resolves(true);
            setUsernameFromFilesystemStub = sinon.stub(mockConnectionManager as any, 'setUsernameFromFilesystem').resolves(true);
            getPasswordFromSecretStorageStub = sinon.stub(mockConnectionManager as any, 'getPasswordFromSecretStorage').resolves(true);
            getAccessTokenFromSecretStorageStub = sinon.stub(mockConnectionManager as any, 'getAccessTokenFromSecretStorage').resolves(false);
            deleteCredentialsFromMemoryStub = sinon.stub(mockConnectionManager as any, 'deleteCredentialsFromMemory').resolves(true);
            resolveUrlsStub = sinon.stub(mockConnectionManager as any, 'resolveUrls').resolves();
            onSuccessConnectStub = sinon.stub(mockConnectionManager, 'onSuccessConnect').resolves();
        });

        afterEach(() => {
            sinon.restore();
        });

        it('Read username and password', async () => {
            // Call the function
            const result: boolean = await mockConnectionManager.connect();

            // Check the return value and ensure that necessary methods are called
            assert.isTrue(result);
            sinon.assert.calledWith(logMessageStub, 'Trying to read credentials from KeyStore...', 'DEBUG');
            sinon.assert.calledOnce(setUrlsFromFilesystemStub);
            sinon.assert.calledOnce(setUsernameFromFilesystemStub);
            sinon.assert.calledOnce(getPasswordFromSecretStorageStub);
            sinon.assert.notCalled(getAccessTokenFromSecretStorageStub);
            sinon.assert.notCalled(deleteCredentialsFromMemoryStub);
            sinon.assert.calledOnce(resolveUrlsStub);
            sinon.assert.calledOnce(onSuccessConnectStub);
        });
        it('Read access token', async () => {
            setUsernameFromFilesystemStub.resolves(false);
            getPasswordFromSecretStorageStub.resolves(false);
            getAccessTokenFromSecretStorageStub.resolves(true);

            // Call the function
            const result: boolean = await mockConnectionManager.connect();

            // Check the return value and ensure that necessary methods are called
            assert.isTrue(result);
            sinon.assert.calledWith(logMessageStub, 'Trying to read credentials from KeyStore...', 'DEBUG');
            sinon.assert.calledOnce(setUrlsFromFilesystemStub);
            sinon.assert.calledOnce(setUsernameFromFilesystemStub);
            sinon.assert.notCalled(getPasswordFromSecretStorageStub);
            sinon.assert.calledOnce(getAccessTokenFromSecretStorageStub);
            sinon.assert.notCalled(deleteCredentialsFromMemoryStub);
            sinon.assert.calledOnce(resolveUrlsStub);
            sinon.assert.calledOnce(onSuccessConnectStub);
        });

        it('Empty KeyStore', async () => {
            setUrlsFromFilesystemStub.resolves(false);
            setUsernameFromFilesystemStub.resolves(false);
            getPasswordFromSecretStorageStub.resolves(false);
            // Call the function
            const result: boolean = await mockConnectionManager.connect();

            // Check the return value and ensure that necessary methods are called
            assert.isFalse(result);
            sinon.assert.calledWith(logMessageStub, 'Trying to read credentials from KeyStore...', 'DEBUG');
            sinon.assert.calledOnce(setUrlsFromFilesystemStub);
            sinon.assert.notCalled(setUsernameFromFilesystemStub);
            sinon.assert.notCalled(getPasswordFromSecretStorageStub);
            sinon.assert.notCalled(getAccessTokenFromSecretStorageStub);
            sinon.assert.calledOnce(deleteCredentialsFromMemoryStub);
            sinon.assert.notCalled(resolveUrlsStub);
            sinon.assert.notCalled(onSuccessConnectStub);
        });
    });

    it('Connect successfully', async () => {
        // Mock dependencies and setup necessary conditions
        const setConnectionStatusStub: sinon.SinonStub<any[], any> = sinon.stub(mockConnectionManager as any, 'setConnectionStatus').resolves();
        const setConnectionViewStub: sinon.SinonStub<any[], any> = sinon.stub(mockConnectionManager as any, 'setConnectionView').resolves(true);
        const updateJfrogVersionsStub: sinon.SinonStub<any[], any> = sinon.stub(mockConnectionManager as any, 'updateJfrogVersions').resolves();
        const executeCommandStub: any = sinon.stub(vscode.commands, 'executeCommand').resolves();

        // Call the function
        await mockConnectionManager.onSuccessConnect();

        // Ensure that necessary methods are called
        sinon.assert.calledOnce(setConnectionStatusStub);
        sinon.assert.calledWith(setConnectionStatusStub, SessionStatus.SignedIn);
        sinon.assert.calledOnce(setConnectionViewStub);
        sinon.assert.calledWith(setConnectionViewStub, SessionStatus.SignedIn);
        sinon.assert.calledOnce(updateJfrogVersionsStub);
        sinon.assert.calledOnce(executeCommandStub);
        sinon.assert.calledWith(executeCommandStub, 'jfrog.view.local');
    });

    describe('JFrog Cli', () => {
        afterEach(() => {
            sinon.restore();
        });
        it('Not installed', async () => {
            // Mock dependencies and setup necessary conditions
            const verifyJfrogCliInstalledAndVersionStub: sinon.SinonStub<any[], any> = sinon
                .stub(mockConnectionManager as any, 'verifyJfrogCliInstalledAndVersion')
                .resolves(false);

            // Call the function
            const result: string = await mockConnectionManager.tryGetUrlFromJFrogCli();

            // Check the return value and ensure that necessary methods are called
            assert.strictEqual(result, '');
            sinon.assert.calledOnce(verifyJfrogCliInstalledAndVersionStub);
        });
    });

    describe('Environment variables', () => {
        afterEach(() => {
            sinon.restore();
        });
        it('Not configured', async () => {
            // Mock dependencies and setup necessary conditions
            process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[
                ConnectionManager.ACCESS_TOKEN_ENV
            ] = process.env[ConnectionManager.URL_ENV] = '';

            // Call the function
            const result: string = mockConnectionManager.tryGetUrlFromEnv();

            // Check the return value and ensure that necessary methods are called
            assert.strictEqual(result, '');
        });
    });

    describe('Web login', () => {
        afterEach(() => {
            sinon.restore();
        });
        it('Start session', async () => {
            // Mock dependencies and setup necessary conditions
            const logMessageStub: any = sinon.stub(mockLogger, 'logMessage');
            logMessageStub.withArgs('Start Web-Login with "mock-url"', 'DEBUG');
            const registerWebLoginIdStub: any = sinon.stub(mockConnectionManager as any, 'registerWebLoginId').resolves(true);
            const openBrowserStub: any = sinon.stub(mockConnectionManager as any, 'openBrowser').resolves(true);
            const getWebLoginAccessTokenStub: any = sinon.stub(mockConnectionManager as any, 'getWebLoginAccessToken').resolves('mock-access-token');
            const tryStoreCredentialsStub: any = sinon.stub(mockConnectionManager, 'tryStoreCredentials').resolves(LoginStatus.Success);

            // Call the function
            const result: LoginStatus = await mockConnectionManager.startWebLogin('mock-url', 'mock-artifactoryUrl', 'mock-xrayUrl');

            // Check the return value and ensure that necessary methods are called
            assert.strictEqual(result, LoginStatus.Success);
            sinon.assert.calledWith(logMessageStub, 'Start Web-Login with "mock-url"', 'DEBUG');
            sinon.assert.calledOnce(registerWebLoginIdStub);
            sinon.assert.calledOnce(openBrowserStub);
            sinon.assert.calledOnce(getWebLoginAccessTokenStub);
            sinon.assert.calledWith(tryStoreCredentialsStub, 'mock-url', 'mock-artifactoryUrl', 'mock-xrayUrl', '', '', 'mock-access-token');
        });
    });

    it('Create endpoint', () => {
        // Mock dependencies and setup necessary conditions
        const platformUrl: string = 'mock-platform-url';
        const sessionId: string = 'mock-session-id';
        const expectedEndpoint: string = 'mock-platform-url/ui/login?jfClientSession=mock-session-id&jfClientName=VS-Code';
        const logMessageStub: any = sinon.stub(mockLogger, 'logMessage');

        // Call the method
        const result: vscode.Uri = mockConnectionManager.createWebLoginEndpoint(platformUrl, sessionId);

        // Check the returned Uri and ensure necessary methods are called
        assert.strictEqual(result.toString(), vscode.Uri.parse(expectedEndpoint).toString());
        sinon.assert.calledWith(logMessageStub, 'Open browser at ' + expectedEndpoint, 'INFO');
    });
});
