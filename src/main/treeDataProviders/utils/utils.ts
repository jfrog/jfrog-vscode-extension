import * as pathUtils from 'path';

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
}
