import { ScanUtils } from './scanUtils';
import * as path from 'path';


// TODO TO BE REPLACED WITH PACKAGE
export class NugetDepsTree {
    public static buildTree(slnFilePath: string): string {
        return ScanUtils.executeCmd('jfrog rt nuget-deps-tree', path.dirname(slnFilePath)).toString();
    }
}
