import * as pathUtils from 'path';
import * as vscode from 'vscode';
import * as os from 'os';

export class Utils {
    /**
     *  @returns the last segment of a path.
     * @param path
     *
     */
    public static getLastSegment(path: string): string {
        if (path === '') {
            return '';
        }
        return path.substring(path.lastIndexOf(pathUtils.sep) + 1);
    }

    public static tryRelativePath(full: string, potentialParent?: string): string {
        if (potentialParent && full.startsWith(potentialParent)) {
            let localPath: string = full.substring(potentialParent.length + 1);
            return './' + localPath;
        }
        return full;
    }

    public static createNodeCommand(name: string, title: string, args: any[]): vscode.Command {
        return {
            command: name,
            title: title,
            arguments: args
        };
    }

    public static getLastScanString(timeStamp: number | undefined): string {
        if (timeStamp) {
            return "scan completed at '" + this.toDate(timeStamp) + "'";
        }
        return '';
    }

    public static toDate(timeStamp: number | undefined): string {
        if (timeStamp == undefined) {
            return 'Never';
        }
        return new Date(timeStamp).toUTCString();
    }

    public static addZipSuffix(str: string): string {
        return str + '.zip';
    }

    public static addWinSuffixIFNeeded(str: string): string {
        return str + (os.platform() === 'win32' ? '.exe' : '');
    }
}
