import * as fs from 'fs';
import * as path from 'path';

import { ScanUtils } from '../utils/scanUtils';
import { ConnectionManager } from '../connect/connectionManager';
import { Configuration } from '../utils/configuration';

export class LogUtils {
    // keep up to 100 logs
    public static readonly KEEP_LOGS_COUNT: number = 100;

    public static cleanUpOldLogs() {
        let logFolder: string = ScanUtils.getLogsPath();
        let logFiles: string[] = fs.readdirSync(logFolder).map(fileName => path.join(logFolder, fileName));
        let toRemoveCount: number = logFiles.length + 1 - this.KEEP_LOGS_COUNT;

        if (toRemoveCount > 0) {
            let logInfo: [string, number][] = logFiles.map(logPath => [logPath, fs.statSync(logPath).birthtime.getTime()]);
            logInfo.sort(([, lTime], [, rTime]) => lTime - rTime);
            for (let i: number = 0; i < toRemoveCount; i++) {
                let [logPath] = logInfo[i];
                fs.rmSync(logPath);
            }
        }
    }

    public static getLogFileName(...args: string[]): string {
        return args.join('-') + '.log';
    }

    public static logErrorWithAnalytics(error: Error, connectionManager: ConnectionManager, shouldToast: boolean = false) {
        connectionManager.logManager.logError(error, shouldToast);
        if (!Configuration.getReportAnalytics()) {
            return;
        }
        connectionManager.logWithAnalytics(`${error.name}: ${error.message}\n${error.stack}`, 'ERR');
    }
}
