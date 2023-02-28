import * as fs from 'fs';
import * as path from 'path';

import { ScanUtils } from '../utils/scanUtils';

export class LogUtils {
    // keep up to 100 logs
    public static readonly KEEP_LOGS_COUNT: number = 100;

    public static cleanUpOldLogs() {
        let logFolder: string = ScanUtils.getLogsPath();
        let logFiles: string[] = fs.readdirSync(logFolder).map(fileName => path.join(logFolder, fileName));
        let toRemoveCount: number = logFiles.length + 1 - this.KEEP_LOGS_COUNT;
        let removed: number = 0;

        if (toRemoveCount > 0) {
            let logInfo: [string, number][] = logFiles.map(logPath => [logPath, fs.statSync(logPath).birthtime.getTime()]);
            logInfo.sort(([, lTime], [, rTime]) => lTime - rTime);
            while (removed < toRemoveCount) {
                fs.rmSync(logFiles[removed]);
                removed++;
            }
        }
    }

    public static getLogFileName(...args: string[]): string {
        return args.join('-') + '.log';
    }
}
