import { assert } from 'chai';

import { ConnectionManager } from '../../../main/connect/connectionManager';
import { LogManager } from '../../../main/log/logManager';
import { ScanUtils } from '../../../main/utils/scanUtils';
import { createTestConnectionManager } from './utils.test';
import { Resource } from '../../../main/utils/resource';
import { BinaryRunner } from '../../../main/scanLogic/scanRunners/binaryRunner';

export class BaseIntegrationEnv {
    public static readonly ENV_PLATFORM_URL: string = 'JFROG_IDE_PLATFORM_URL';
    public static readonly ENV_ACCESS_TOKEN: string = 'JFROG_IDE_ACCESS_TOKEN';

    public static readonly RETRIES: number = 3;

    public readonly logManager: LogManager = new LogManager().activate();

    private static _connectionManager: ConnectionManager;

    public static directory: string;

    public async initialize() {
        if (BaseIntegrationEnv._connectionManager) {
            return;
        }
        // Initialize connection manager
        let connection: ConnectionManager = await createTestConnectionManager(this.logManager);
        // Don't override existing connection details
        let oldUrl: string | undefined = process.env[ConnectionManager.URL_ENV];
        let oldToken: string | undefined = process.env[ConnectionManager.ACCESS_TOKEN_ENV];
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';
        process.env[ConnectionManager.URL_ENV] = process.env[BaseIntegrationEnv.ENV_PLATFORM_URL];
        process.env[ConnectionManager.ACCESS_TOKEN_ENV] = process.env[BaseIntegrationEnv.ENV_ACCESS_TOKEN];
        // Try to get credentials
        try {
            for (let i: number = 0; i < BaseIntegrationEnv.RETRIES; i++) {
                if (await connection.tryCredentialsFromEnv()) {
                    BaseIntegrationEnv._connectionManager = connection;
                    return;
                }
                if (await connection.tryCredentialsFromJfrogCli()) {
                    BaseIntegrationEnv._connectionManager = connection;
                    return;
                }
            }
            assert.fail(
                `Failed to load JFrog platform credentials from CLI or Environment variables '${BaseIntegrationEnv.ENV_PLATFORM_URL}' and '${BaseIntegrationEnv.ENV_ACCESS_TOKEN}'`
            );
        } finally {
            process.env[ConnectionManager.URL_ENV] = oldUrl;
            process.env[ConnectionManager.ACCESS_TOKEN_ENV] = oldToken;
        }
    }

    public get connectionManager(): ConnectionManager {
        return BaseIntegrationEnv._connectionManager;
    }
}

export class AnalyzerManagerIntegrationEnv extends BaseIntegrationEnv {
    public static readonly ENV_BINARY_DOWNLOAD_URL: string = 'JFROG_IDE_ANALYZER_MANAGER_DOWNLOAD_URL';
    public static readonly ENV_DOWNLOAD_FROM_PLATFORM: string = 'JFROG_IDE_DOWNLOAD_FROM_PLATFORM';

    private _resource!: Resource;

    /** @override */
    public async initialize() {
        await super.initialize();

        let downloadPlatformUrl: string | undefined = process.env[AnalyzerManagerIntegrationEnv.ENV_DOWNLOAD_FROM_PLATFORM];
        let baseDownloadUrl: string | undefined = process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_DOWNLOAD_URL];

        // Initialize analyzerManager resource for testing
        if (downloadPlatformUrl || baseDownloadUrl) {
            // Download from a different place in releases
            this._resource = new Resource(
                <string>process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_DOWNLOAD_URL],
                BinaryRunner.getDefaultAnalyzerManagerTargetPath(BaseIntegrationEnv.directory),
                this.logManager
            );
        } else {
            // Run on latest from Releases
            this._resource = BinaryRunner.getAnalyzerManagerResource(
                this.logManager,
                BinaryRunner.getDefaultAnalyzerManagerTargetPath(BaseIntegrationEnv.directory)
            );
        }
    }

    public get resource(): Resource {
        return this._resource;
    }
}

export async function initializeIntegrationTests() {
    // Initialize
    BaseIntegrationEnv.directory = ScanUtils.createTmpDir();
    let integration: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    await integration.initialize();
    // Get the analyzerManager (once) to the integration directory for all the scanners to use in the integration tests
    for (let i: number = 0; i < BaseIntegrationEnv.RETRIES; i++) {
        if (await integration.resource.update()) {
            return;
        }
    }
    assert.fail(
        'Failed to download analyzerManager from ' +
            (process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_DOWNLOAD_URL] ?? 'latest version') +
            ' Url from ' +
            (process.env[AnalyzerManagerIntegrationEnv.ENV_DOWNLOAD_FROM_PLATFORM] ?? 'releases') +
            'platform'
    );
}

export async function cleanUpIntegrationTests() {
    await ScanUtils.removeFolder(BaseIntegrationEnv.directory);
}
