import { assert } from 'chai';
import * as path from 'path';

import { ConnectionManager } from '../../../main/connect/connectionManager';
import { LogManager } from '../../../main/log/logManager';
import { ScanUtils } from '../../../main/utils/scanUtils';
import { createTestConnectionManager } from './utils.test';
import { Resource } from '../../../main/utils/resource';
import { BinaryRunner } from '../../../main/scanLogic/scanRunners/binaryRunner';
import { AnalyzerUtils, FileWithSecurityIssues, SecurityIssue } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';

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
    public static readonly ENV_BINARY_FROM_DIRECTORY: string = 'JFROG_IDE_ANALYZER_MANAGER_DIRECTORY';

    private _resource!: Resource;
    private _localPath?: string;

    /** @override */
    public async initialize() {
        await super.initialize();

        let downloadPlatformUrl: string | undefined = process.env[AnalyzerManagerIntegrationEnv.ENV_DOWNLOAD_FROM_PLATFORM];
        let baseDownloadUrl: string | undefined = process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_DOWNLOAD_URL];
        this._localPath = process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_FROM_DIRECTORY];

        // Initialize analyzerManager resource for testing
        if (downloadPlatformUrl || baseDownloadUrl) {
            // Download from a different place in releases
            this._resource = new Resource(
                <string>process.env[AnalyzerManagerIntegrationEnv.ENV_BINARY_DOWNLOAD_URL],
                BinaryRunner.getDefaultAnalyzerManagerTargetPath(BaseIntegrationEnv.directory),
                this.logManager,
                this.connectionManager.createJfrogClient()
            );
        } else {
            // Run on latest from Releases
            this._resource = BinaryRunner.getAnalyzerManagerResource(
                this.logManager,
                BinaryRunner.getDefaultAnalyzerManagerTargetPath(this._localPath ?? BaseIntegrationEnv.directory),
                this.connectionManager.createJfrogClient()
            );
        }
    }

    public get localPath(): string | undefined {
        return this._localPath;
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
    if (!integration.localPath) {
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
}

export async function cleanUpIntegrationTests() {
    await ScanUtils.removeFolder(BaseIntegrationEnv.directory);
}

function getTestFileIssues(filePath: string, filesWithIssues: FileWithSecurityIssues[]): FileWithSecurityIssues {
    let potential: FileWithSecurityIssues | undefined = filesWithIssues.find(
        (fileWithIssues: FileWithSecurityIssues) => AnalyzerUtils.parseLocationFilePath(fileWithIssues.full_path) === filePath
    );
    assert.isDefined(potential, 'Response should contain file with issues at path ' + filePath);
    return potential!;
}

function getTestIssue(filePath: string, filesWithIssues: FileWithSecurityIssues[], ruleId: string): SecurityIssue {
    let fileWithIssues: FileWithSecurityIssues = getTestFileIssues(filePath, filesWithIssues);
    let potential: SecurityIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === ruleId);
    assert.isDefined(potential, 'Expected ' + ruleId + ' should be contain detected as issues of file ' + filePath);
    return potential!;
}

function getTestLocation(filePath: string, filesWithIssues: FileWithSecurityIssues[], ruleId: string, location: FileRegion): FileRegion {
    let issue: SecurityIssue = getTestIssue(filePath, filesWithIssues, ruleId);
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

export function assertFileIssuesExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        assert.isDefined(getTestFileIssues(path.join(testDataRoot, expectedFileWithIssues.full_path), responseFilesWithIssues));
    });
}

export function assertIssuesExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            assert.isDefined(getTestIssue(path.join(testDataRoot, expectedFileWithIssues.full_path), responseFilesWithIssues, expectedIssues.ruleId));
        });
    });
}

export function assertIssuesLocationsExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.isDefined(
                    getTestLocation(
                        path.join(testDataRoot, expectedFileWithIssues.full_path),
                        responseFilesWithIssues,
                        expectedIssues.ruleId,
                        expectedLocation
                    )
                );
            });
        });
    });
}

export function assertIssuesRuleNameExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            assert.deepEqual(
                getTestIssue(path.join(testDataRoot, expectedFileWithIssues.full_path), responseFilesWithIssues, expectedIssues.ruleId).ruleName,
                expectedIssues.ruleName
            );
        });
    });
}

export function assertIssuesFullDescriptionExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            assert.deepEqual(
                getTestIssue(path.join(testDataRoot, expectedFileWithIssues.full_path), responseFilesWithIssues, expectedIssues.ruleId)
                    .fullDescription,
                expectedIssues.fullDescription
            );
        });
    });
}

export function assertIssuesSeverityExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            assert.deepEqual(
                getTestIssue(path.join(testDataRoot, expectedFileWithIssues.full_path), responseFilesWithIssues, expectedIssues.ruleId).severity,
                expectedIssues.severity
            );
        });
    });
}

export function assertIssuesLocationSnippetsExist(
    testDataRoot: string,
    responseFilesWithIssues: FileWithSecurityIssues[],
    expectedFilesWithIssues: FileWithSecurityIssues[]
) {
    expectedFilesWithIssues.forEach((expectedFileWithIssues: FileWithSecurityIssues) => {
        expectedFileWithIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(
                    getTestLocation(
                        path.join(testDataRoot, expectedFileWithIssues.full_path),
                        responseFilesWithIssues,
                        expectedIssues.ruleId,
                        expectedLocation
                    ).snippet?.text,
                    expectedLocation.snippet?.text
                );
            });
        });
    });
}
