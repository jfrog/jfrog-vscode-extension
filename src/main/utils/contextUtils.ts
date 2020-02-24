import * as fse from 'fs-extra';
import * as path from 'path';
import md5 from 'md5';
import * as os from 'os';
import { TreesManager } from '../treeDataProviders/treesManager';

export class ContextUtils {
    public static getPathToWorkspaceStorage(storagePath: string | undefined, ...args: string[]): string | undefined {
        if (storagePath === undefined) {
            return undefined;
        }
        fse.ensureDirSync(storagePath);
        return path.join(storagePath, ...args);
    }

    public static getTempFolder(identifier: string, treesManager: TreesManager): string {
        const outputPath: string | undefined = ContextUtils.getPathToWorkspaceStorage(treesManager.storagePath, md5(identifier));
        return outputPath ? outputPath : ContextUtils.getPathToTempFolder(md5(identifier));
    }

    public static getPathToTempFolder(...args: string[]): string {
        return path.join(os.tmpdir(), ...args);
    }

    public static readFileIfExists(filePase: string): string | undefined {
        if (fse.pathExistsSync(filePase)) {
            return fse.readFileSync(filePase).toString();
        }
        return undefined;
    }

    public static removeFile(filePase: string): void {
        if (fse.pathExistsSync(filePase)) {
            fse.removeSync(filePase);
        }
    }
}
