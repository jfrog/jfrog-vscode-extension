import { assert } from 'chai';

import { execSync } from 'child_process';
import { IJfrogClientConfig, IProxyConfig } from 'jfrog-client-js';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { ConnectionUtils } from '../../main/connect/connectionUtils';
import { LogManager } from '../../main/log/logManager';
import { createTestConnectionManager, getCliHomeDir, setCliHomeDir } from './utils/utils.test';

describe('Connection Manager Tests', () => {
    let connectionManager: ConnectionManager;
    before(async () => {
        // Don't override existing connection details
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';

        connectionManager = await createTestConnectionManager(new LogManager().activate(), 100000, 100);
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

    describe('Populate credentials from env', () => {
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
                await connectionManager.populateCredentials(false);
                assert.isFalse(connectionManager.areXrayCredentialsSet());

                await populateCredsAndAssert(testCase, 'admin', 'password', '');
                await populateCredsAndAssert(testCase, '', '', 'token');

                // Restore old CLI home dir.
                setCliHomeDir(previousHome);
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

    describe('Read credentials from JFrog CLI', () => {
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
                await connectionManager.populateCredentials(false);
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
            });
        });
    });
});
