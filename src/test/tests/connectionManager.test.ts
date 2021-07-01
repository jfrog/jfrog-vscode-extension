import { assert } from 'chai';

import { ConnectionManager } from '../../main/connect/connectionManager';
import { IClientConfig, IProxyConfig } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { LogManager } from '../../main/log/logManager';
import { ConnectionUtils } from '../../main/connect/connectionUtils';

describe('Connection Manager Tests', () => {
    let connectionManager: ConnectionManager;

    before(async () => {
        // Don't override existing connection details
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';

        connectionManager = await new ConnectionManager(new LogManager().activate({} as vscode.ExtensionContext)).activate({
            globalState: { get(key: string) {} } as vscode.Memento
        } as vscode.ExtensionContext);
    });

    it('User agent header', () => {
        let clientConfig: IClientConfig = {
            headers: {}
        } as IClientConfig;

        ConnectionUtils.addUserAgentHeader(clientConfig);
        let userAgent: string | undefined = clientConfig.headers!['User-Agent'];
        assert.isDefined(userAgent);
        assert.match(userAgent, new RegExp(/^jfrog-vscode-extension\/\d.\d.\d$/));
    });

    it('Proxy authorization header', async () => {
        let clientConfig: IClientConfig = {
            headers: {},
            proxy: {} as IProxyConfig
        } as IClientConfig;

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
                // Check credentials not set
                process.env[ConnectionManager.USERNAME_ENV] = process.env[ConnectionManager.PASSWORD_ENV] = process.env[ConnectionManager.URL_ENV] =
                    '';
                await connectionManager.populateCredentials(false);
                assert.isFalse(connectionManager.areXrayCredentialsSet());

                process.env[ConnectionManager.URL_ENV] = testCase.inputUrl;
                process.env[ConnectionManager.USERNAME_ENV] = 'admin';
                process.env[ConnectionManager.PASSWORD_ENV] = 'password';

                await connectionManager.populateCredentials(false);
                assert.isTrue(connectionManager.areXrayCredentialsSet());
                assert.equal(connectionManager.url, testCase.expectedPlatformUrl);
                assert.equal(connectionManager.xrayUrl, testCase.expectedXrayUrl);
                assert.equal(connectionManager.username, 'admin');
                assert.equal(connectionManager.password, 'password');
            });
        });
    });
});
