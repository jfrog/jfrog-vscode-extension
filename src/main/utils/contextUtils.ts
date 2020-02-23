import * as fse from 'fs-extra';
import * as path from 'path';
import md5 from 'md5';
import * as os from 'os';

import { ExtensionContext } from 'vscode';

let EXTENSION_CONTEXT: ExtensionContext;

export async function loadPackageInfo(context: ExtensionContext): Promise<void> {
    EXTENSION_CONTEXT = context;
}

export function getPathToWorkspaceStorage(...args: string[]): string | undefined {
    if (EXTENSION_CONTEXT.storagePath === undefined) {
        return undefined;
    }
    fse.ensureDirSync(EXTENSION_CONTEXT.storagePath);
    return path.join(EXTENSION_CONTEXT.storagePath, ...args);
}

export function getTempFolder(identifier: string): string {
    const outputPath: string | undefined = getPathToWorkspaceStorage(md5(identifier));
    return outputPath ? outputPath : getPathToTempFolder(md5(identifier));
}

export function getPathToTempFolder(...args: string[]): string {
    return path.join(os.tmpdir(), ...args);
}

export function readFileIfExists(filePase: string): string | undefined {
    if (fse.pathExistsSync(filePase)) {
        return fse.readFileSync(filePase).toString();
    }
    return undefined;
}
export function removeFile(filePase: string): void {
    fse.removeSync(filePase);
}
