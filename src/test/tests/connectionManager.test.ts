import { assert } from 'chai';

import { ConnectionManager } from '../../main/connect/connectionManager';
import { IJfrogClientConfig, IProxyConfig } from 'jfrog-client-js';
import * as vscode from 'vscode';
import * as path from 'path';
import { LogManager } from '../../main/log/logManager';
import { ConnectionUtils } from '../../main/connect/connectionUtils';
import { execSync } from 'child_process';
import { getCliHomeDir, setCliHomeDir } from './utils/utils.test';

describe('Connection Manager Tests', () => {
    let connectionManager: ConnectionManager;

    before(async () => {
        // Don't override existing connection details
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';

        connectionManager = await new ConnectionManager(new LogManager().activate()).activate({
            globalState: {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                get(key: string) {
                    return;
                }
            } as vscode.Memento
        } as vscode.ExtensionContext);
    });

    it('User agent header', () => {
        let clientConfig: IJfrogClientConfig = {
            headers: {}
        } as IJfrogClientConfig;

        ConnectionUtils.addUserAgentHeader(clientConfig);
        let userAgent: string | undefined = clientConfig.headers!['User-Agent'];
        assert.isDefined(userAgent);
        assert.match(userAgent, new RegExp(/^jfrog-vscode-extension\/\d.\d.\d$/));
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
                expectedXrayUrl: 'https://httpbin.org/anything/xray',
                expectedRtUrl: 'https://httpbin.org/anything/artifactory'
            },
            {
                inputUrl: 'https://httpbin.org/anything/',
                expectedPlatformUrl: 'https://httpbin.org/anything/',
                expectedXrayUrl: 'https://httpbin.org/anything/xray',
                expectedRtUrl: 'https://httpbin.org/anything/artifactory'
            },
            {
                inputUrl: 'https://httpbin.org/anything/xray',
                expectedPlatformUrl: 'https://httpbin.org/anything',
                expectedXrayUrl: 'https://httpbin.org/anything/xray',
                expectedRtUrl: 'https://httpbin.org/anything/artifactory'
            },
            {
                inputUrl: 'https://httpbin.org/anything/xray/',
                expectedPlatformUrl: 'https://httpbin.org/anything',
                expectedXrayUrl: 'https://httpbin.org/anything/xray/',
                expectedRtUrl: 'https://httpbin.org/anything/artifactory'
            },
            {
                inputUrl: 'https://httpbin.org/status/404/different-xray-url',
                expectedPlatformUrl: '',
                expectedXrayUrl: 'https://httpbin.org/status/404/different-xray-url',
                expectedRtUrl: ''
            },
            {
                inputUrl: 'https://httpbin.org/status/404/different-xray-url/',
                expectedPlatformUrl: '',
                expectedXrayUrl: 'https://httpbin.org/status/404/different-xray-url/',
                expectedRtUrl: ''
            }
        ].forEach(async testCase => {
            it('Input URL: ' + testCase.inputUrl, async () => {
                process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[
                    ConnectionManager.ACCESS_TOKEN_ENV
                ] = process.env[ConnectionManager.URL_ENV] = '';

                // Store previous CLI home, and set to a non existing path so no credentials will be read from the CLI.
                const previousHome: string = getCliHomeDir();
                setCliHomeDir(path.resolve('/path/to/no/where'));

                // Check credentials not set.
                await connectionManager.populateCredentials(false);
                assert.isFalse(connectionManager.areXrayCredentialsSet());

                process.env[ConnectionManager.URL_ENV] = testCase.inputUrl;
                process.env[ConnectionManager.USERNAME_ENV] = 'admin';
                process.env[ConnectionManager.PASSWORD_ENV] = 'password';
                process.env[ConnectionManager.ACCESS_TOKEN_ENV] = 'token';

                await connectionManager.populateCredentials(false);
                assert.isTrue(connectionManager.areXrayCredentialsSet());
                assert.equal(connectionManager.url, testCase.expectedPlatformUrl);
                assert.equal(connectionManager.xrayUrl, testCase.expectedXrayUrl);
                assert.equal(connectionManager.username, 'admin');
                assert.equal(connectionManager.password, 'password');
                assert.equal(connectionManager.accessToken, 'token');

                // Restore old CLI home dir.
                setCliHomeDir(previousHome);
            });
        });
    });

    describe('Read credentials from JFrog CLI', () => {
        [
            {
                serverId: 'basic-auth-only',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: 'username',
                expectedPassword: 'pass',
                expectedAccessToken: ''
            },
            {
                serverId: 'access-token-only',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: '',
                expectedPassword: '',
                expectedAccessToken: 'token'
            },
            {
                serverId: 'with-refresh-token',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: 'username',
                expectedPassword: 'pass',
                expectedAccessToken: ''
            },
            {
                serverId: 'empty-creds',
                expectedPlatformUrl: 'https://myplatform.jfrog.io/',
                expectedRtUrl: 'https://myplatform.jfrog.io/artifactory/',
                expectedXrayUrl: 'https://myplatform.jfrog.io/xray/',
                expectedUsername: '',
                expectedPassword: '',
                expectedAccessToken: ''
            }
        ].forEach(async testCase => {
            it('Credentials type: ' + testCase.serverId, async () => {
                // Make sure credentials are not set from env.
                process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[
                    ConnectionManager.ACCESS_TOKEN_ENV
                ] = process.env[ConnectionManager.URL_ENV] = '';

                // Store previous CLI home, and set new one to test data.
                const previousHome: string = getCliHomeDir();
                setCliHomeDir('/path/to/no/where');

                // Assert credentials are empty.
                await connectionManager.populateCredentials(false);
                assert.isFalse(connectionManager.areXrayCredentialsSet());

                // Set new home to test data.
                //setCliHomeDir(path.resolve('../resources/cliHome'));
                setCliHomeDir(path.join(__dirname, '..', 'resources', 'cliHome'));

                // Use the corresponding server-id to the test case.
                assert.doesNotThrow(() => execSync('jf c use ' + testCase.serverId.trim()));

                await connectionManager.populateCredentials(false);
                assert.isTrue(connectionManager.areCompleteCredentialsSet());
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
