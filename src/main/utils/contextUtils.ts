import * as fse from 'fs-extra';

export class ContextUtils {
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
