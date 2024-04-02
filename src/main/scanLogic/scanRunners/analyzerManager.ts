import * as path from 'path';
import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { Resource } from '../../utils/resource';
import { Utils } from '../../utils/utils';
import { ScanUtils } from '../../utils/scanUtils';
import { IProxyConfig, JfrogClient } from 'jfrog-client-js';
import { ConnectionUtils } from '../../connect/connectionUtils';
import { Configuration } from '../../utils/configuration';
import { Translators } from '../../utils/translators';
import { BinaryEnvParams } from './jasRunner';

/**
 * Analyzer manager is responsible for running the analyzer on the workspace.
 */
export class AnalyzerManager {
    private static readonly RELATIVE_DOWNLOAD_URL: string = '/xsc-gen-exe-analyzer-manager-local/v1/[RELEASE]';
    private static readonly BINARY_NAME: string = 'analyzerManager';
    public static readonly ANALYZER_MANAGER_PATH: string = Utils.addWinSuffixIfNeeded(
        path.join(ScanUtils.getIssuesPath(), AnalyzerManager.BINARY_NAME, AnalyzerManager.BINARY_NAME)
    );
    private static readonly DOWNLOAD_URL: string = Utils.addZipSuffix(
        AnalyzerManager.RELATIVE_DOWNLOAD_URL + '/' + Utils.getPlatformAndArch() + '/' + AnalyzerManager.BINARY_NAME
    );

    private static readonly JFROG_RELEASES_URL: string = 'https://releases.jfrog.io';
    public static readonly JF_RELEASES_REPO: string = 'JF_RELEASES_REPO';

    public static readonly ENV_PLATFORM_URL: string = 'JF_PLATFORM_URL';
    public static readonly ENV_TOKEN: string = 'JF_TOKEN';
    public static readonly ENV_USER: string = 'JF_USER';
    public static readonly ENV_PASSWORD: string = 'JF_PASS';
    public static readonly ENV_MSI: string = 'JF_MSI';
    public static readonly ENV_LOG_DIR: string = 'AM_LOG_DIRECTORY';
    public static readonly ENV_HTTP_PROXY: string = 'HTTP_PROXY';
    public static readonly ENV_HTTPS_PROXY: string = 'HTTPS_PROXY';

    protected _binary: Resource;
    private _version: string = '';
    private static FINISH_UPDATE_PROMISE: Promise<boolean>;

    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {
        this._binary = new Resource(AnalyzerManager.DOWNLOAD_URL, AnalyzerManager.ANALYZER_MANAGER_PATH, _logManager, this.createJFrogCLient());
        AnalyzerManager.FINISH_UPDATE_PROMISE = this.checkForUpdates();
    }

    private createJFrogCLient(): JfrogClient {
        const releasesRepo: JfrogClient | undefined = this.getExternalResourcesRepository();
        if (!releasesRepo) {
            return ConnectionUtils.createJfrogClient(
                AnalyzerManager.JFROG_RELEASES_URL,
                AnalyzerManager.JFROG_RELEASES_URL + '/artifactory',
                '',
                '',
                '',
                '',
                this._logManager
            );
        }
        return releasesRepo;
    }

    private getExternalResourcesRepository(): JfrogClient | undefined {
        const releasesRepo: string = Configuration.getExternalResourcesRepository();
        if (releasesRepo === '') {
            return undefined;
        }
        if (!this._connectionManager.areCompleteCredentialsSet()) {
            this._logManager.logMessage(
                'Cannot use ' + Configuration.JFROG_IDE_RELEASES_REPO_ENV + ' in the settings. No Artifactory URL is configured',
                'ERR',
                true
            );
            return undefined;
        }
        this._logManager.logMessage('Using external resource from repository: ' + releasesRepo, 'INFO');
        return this._connectionManager.createJfrogClientWithRepository(releasesRepo + '/artifactory');
    }

    private async checkForUpdates(): Promise<boolean> {
        if (await this._binary.isOutdated()) {
            this._logManager.logMessage('Updating Advanced Security Features', 'INFO');
            try {
                return await this._binary.update();
            } catch (error) {
                this._connectionManager.logErrorWithAnalytics(new Error('Failed to check if extension is outdated: ' + error));
            }
        }
        return false;
    }

    /**
     * Execute the cmd command to run the binary with given arguments
     * @param args - the arguments for the command
     * @param checkCancel - A function that throws ScanCancellationError if the user chose to stop the scan
     * @param executionLogDirectory - the directory to save the execution log in
     */
    public async run(args: string[], checkCancel: () => void, env?: NodeJS.ProcessEnv | undefined): Promise<string> {
        await AnalyzerManager.FINISH_UPDATE_PROMISE;
        return await this._binary.run(args, checkCancel, env);
    }

    /**
     * Create the needed environment variables for the runner to run
     * @param executionLogDirectory - the directory that the log will be written into, if not provided the log will be written in stdout/stderr
     * @returns list of environment variables to use while executing the runner or unidentified if credential not set
     */
    public createEnvForRun(params?: BinaryEnvParams): NodeJS.ProcessEnv | undefined {
        if (!this._connectionManager.areXrayCredentialsSet()) {
            return undefined;
        }

        let binaryVars: NodeJS.ProcessEnv = { JFROG_CLI_LOG_LEVEL: Translators.toAnalyzerLogLevel(Configuration.getLogLevel()) };
        // Platform information
        binaryVars[AnalyzerManager.ENV_PLATFORM_URL] = this._connectionManager.url;
        // Credentials information
        if (this._connectionManager.accessToken) {
            binaryVars[AnalyzerManager.ENV_TOKEN] = this._connectionManager.accessToken;
        } else {
            binaryVars[AnalyzerManager.ENV_USER] = this._connectionManager.username;
            binaryVars[AnalyzerManager.ENV_PASSWORD] = this._connectionManager.password;
        }

        this.populateOptionalInformation(binaryVars, params);

        return {
            ...process.env,
            ...binaryVars
        };
    }

    private populateOptionalInformation(binaryVars: NodeJS.ProcessEnv, params?: BinaryEnvParams) {
        // Optional proxy information - environment variable
        let proxyHttpUrl: string | undefined = process.env['HTTP_PROXY'];
        let proxyHttpsUrl: string | undefined = process.env['HTTPS_PROXY'];
        // Optional proxy information - vscode configuration override
        let optional: IProxyConfig | boolean = ConnectionUtils.getProxyConfig();
        if (optional) {
            let proxyConfig: IProxyConfig = <IProxyConfig>optional;
            let proxyUrl: string = proxyConfig.host + (proxyConfig.port !== 0 ? ':' + proxyConfig.port : '');
            proxyHttpUrl = 'http://' + proxyUrl;
            proxyHttpsUrl = 'https://' + proxyUrl;
        }
        if (proxyHttpUrl) {
            binaryVars[AnalyzerManager.ENV_HTTP_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpUrl);
        }
        if (proxyHttpsUrl) {
            binaryVars[AnalyzerManager.ENV_HTTPS_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpsUrl);
        }
        // Optional log destination
        if (params?.executionLogDirectory) {
            binaryVars.AM_LOG_DIRECTORY = params.executionLogDirectory;
        }
        // Optional Multi scan id
        if (params?.msi) {
            binaryVars.ENV_MSI = params.msi;
        }
    }

    /**
     * Add optional proxy auth information to the base url if exists
     * @param url - Base url to add information on
     * @returns the url with the auth information if exists or the given url if not
     */
    private addOptionalProxyAuthInformation(url: string): string {
        let authOptional: string | undefined = Configuration.getProxyAuth();
        if (authOptional) {
            if (authOptional.startsWith('Basic ')) {
                // We expect the decoded auth string to be in the format: <proxy-user>:<proxy-password>
                return Buffer.from(authOptional.substring('Basic '.length), 'base64').toString('binary') + '@' + url;
            } else if (authOptional.startsWith('Bearer ')) {
                // Access token
                return url + '?access_token=' + authOptional.substring('Bearer '.length);
            }
        }
        return url;
    }

    public async version(): Promise<string | undefined> {
        if (this._version !== '') {
            return this._version;
        }
        await AnalyzerManager.FINISH_UPDATE_PROMISE;
        try {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            let versionString: string = await this._binary.run(['version'], () => {});
            // Extract the version from the output
            const match: RegExpMatchArray | null = versionString.match('/analyzer manager version:\\s*(\\S+)/');
            if (match && match.length > 1) {
                this._version = match[1];
            }
        } catch (error) {
            this._connectionManager.logErrorWithAnalytics(<Error>error);
            return undefined;
        }
        return this._version;
    }
}
