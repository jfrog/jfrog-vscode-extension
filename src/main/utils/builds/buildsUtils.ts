import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';
import { BuildGeneralInfo, Status } from '../../types/buildGeneralinfo';
import { GeneralInfo } from '../../types/generalInfo';
import { Vcs } from '../../types/vcs';
import { IconsPaths } from '../iconsPaths';
import { CiTitleNode } from '../../treeDataProviders/ciTree/ciTitleNode';
import { PackageType } from '../../types/projectType';

export class BuildsUtils {
    public static readonly BUILD_STATUS_PROP: string = 'buildInfo.env.JFROG_BUILD_STATUS';

    public static readonly BUILD_RET_ERR_FMT: string = "Couldn't retrieve build information for build '%s/%s'.";

    public static createBuildGeneralInfo(build: any, logger: LogManager): BuildGeneralInfo {
        let vcsList: Vcs[] = build.vcs;
        if (!vcsList) {
            logger.logMessage(`Build '${build.name}/${build.number}' does not contain the branch VCS information.`, 'DEBUG');
            vcsList = [new Vcs()];
        }
        const status: string = build?.properties?.[BuildsUtils.BUILD_STATUS_PROP] || '';
        const started: Date | null = build.started ? new Date(build.started) : null;
        return new BuildGeneralInfo(
            build.name,
            BuildsUtils.getStatusFromString(status),
            started,
            vcsList[0],
            build.number,
            build.url,
            ['None'],
            PackageType.Unknown
        );
    }

    public static getStatusFromString(status: string): Status {
        switch (status) {
            case 'PASS':
                return Status.Success;
            case 'FAIL':
                return Status.Failed;
            default:
                return Status.Unknown;
        }
    }

    public static createArtifactsNode(): CiTitleNode {
        return new CiTitleNode(
            new GeneralInfo(CiTitleNode.ARTIFACTS_NODE, '', ['None'], '', PackageType.Unknown),
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined
        );
    }

    public static createDependenciesNode(): CiTitleNode {
        return new CiTitleNode(
            new GeneralInfo(CiTitleNode.DEPENDENCIES_NODE, '', ['None'], '', PackageType.Unknown),
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined
        );
    }

    public static getArtifactIdFromCompId(componentId: string): string {
        const sep: number = componentId.lastIndexOf(':');
        if (sep < 0) {
            return componentId;
        }
        return componentId.substring(0, sep);
    }

    public static getVersionFromCompId(componentId: string): string {
        const sep: number = componentId.lastIndexOf(':');
        if (sep < 0) {
            return '';
        }
        return componentId.substring(componentId.lastIndexOf(':') + 1);
    }

    public static isArrayExistsAndNotEmpty(obj: any, fieldName: string): boolean {
        return Object.prototype.hasOwnProperty.call(obj, fieldName) && Array.isArray(obj[fieldName]) && obj[fieldName].length;
    }

    public static getIcon(status: Status) {
        switch (status) {
            case Status.Success:
                return IconsPaths.BUILD_SUCCESS;
            case Status.Failed:
                return IconsPaths.BUILD_FAILED;
            default:
                return IconsPaths.BUILD_UNKNOWN;
        }
    }
}
