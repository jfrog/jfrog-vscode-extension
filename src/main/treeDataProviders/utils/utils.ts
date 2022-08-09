import * as pathUtils from 'path';
import * as vscode from 'vscode';

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

    public static createNodeCommand(name: string, title: string, args: any[]): vscode.Command {
        return {
            command: name,
            title: title,
            arguments: args
        };
    }
}
