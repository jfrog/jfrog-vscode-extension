import { assert } from 'chai';

import { ConnectionManager } from '../../../main/connect/connectionManager';
import { LogManager } from '../../../main/log/logManager';
import { ScanUtils } from '../../../main/utils/scanUtils';
import { createTestConnectionManager } from './utils.test';
import { Resource } from '../../../main/utils/resource';
import { BinaryRunner } from '../../../main/scanLogic/scanRunners/binaryRunner';

export async function initializeIntegrationTests() {
    // Initialize
    BaseIntegrationEnv.directory = ScanUtils.createTmpDir();
    let integration: AnalyzerManagerIntegration = new AnalyzerManagerIntegration();
    await integration.initialize();
    // Get the analyzerManager (once) to the integration directory for all the scanners to use in the integration tests
    if (!(await integration.resource.update())) {
        assert.fail(
            'Failed to download analyzerManager from ' +
                (process.env[AnalyzerManagerIntegration.ENV_BINARY_DOWNLOAD_URL] ?? 'latest version') +
                ' Url from ' +
                (process.env[AnalyzerManagerIntegration.ENV_DOWNLOAD_FROM_PLATFORM] ?? 'releases') +
                'platform'
        );
    }
}

export async function cleanUpIntegrationTests() {
    await ScanUtils.removeFolder(BaseIntegrationEnv.directory);
}

export class BaseIntegrationEnv {
    public static readonly ENV_PLATFORM_URL: string = 'JFROG_IDE_PLATFORM_URL';
    public static readonly ENV_ACCESS_TOKEN: string = 'JFROG_IDE_ACCESS_TOKEN';

    public readonly logManager: LogManager = new LogManager().activate();

    private _connectionManager!: ConnectionManager;

    public static directory: string;

    public async initialize() {
        // Initialize connection manager
        this._connectionManager = await createTestConnectionManager(this.logManager);
        // Don't override existing connection details
        let tempUrl: string | undefined = process.env[ConnectionManager.URL_ENV];
        let tempAccess: string | undefined = process.env[ConnectionManager.ACCESS_TOKEN_ENV];
        process.env[ConnectionManager.STORE_CONNECTION_ENV] = 'FALSE';
        process.env[ConnectionManager.URL_ENV] = process.env[BaseIntegrationEnv.ENV_PLATFORM_URL];
        process.env[ConnectionManager.ACCESS_TOKEN_ENV] = process.env[BaseIntegrationEnv.ENV_ACCESS_TOKEN];
        // Try to get credentials
        try {
            if (await this._connectionManager.tryCredentialsFromEnv()) {
                return;
            }
            if (await this._connectionManager.tryCredentialsFromJfrogCli()) {
                return;
            }
            assert.fail(`Failed to load JFrog platform credentials from CLI or Environment variables '${BaseIntegrationEnv.ENV_PLATFORM_URL}' and '${BaseIntegrationEnv.ENV_ACCESS_TOKEN}'`);
        } finally {
            process.env[ConnectionManager.URL_ENV] = tempUrl;
            process.env[ConnectionManager.ACCESS_TOKEN_ENV] = tempAccess;
        }
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }
}

export class AnalyzerManagerIntegration extends BaseIntegrationEnv {
    public static readonly ENV_BINARY_DOWNLOAD_URL: string = 'JFROG_IDE_ANALYZER_MANAGER_DOWNLOAD_URL';
    public static readonly ENV_DOWNLOAD_FROM_PLATFORM: string = 'JFROG_IDE_DOWNLOAD_FROM_PLATFORM';

    private _resource!: Resource;

    /** @override */
    public async initialize() {
        await super.initialize();

        let downloadPlatformUrl: string | undefined = process.env[AnalyzerManagerIntegration.ENV_DOWNLOAD_FROM_PLATFORM];
        let baseDownloadUrl: string | undefined = process.env[AnalyzerManagerIntegration.ENV_BINARY_DOWNLOAD_URL];

        // Initialize analyzerManager resource for testing
        if (downloadPlatformUrl || baseDownloadUrl) {
            // Download from a different place in releases
            this._resource = new Resource(
                <string>process.env[AnalyzerManagerIntegration.ENV_BINARY_DOWNLOAD_URL],
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
