import {LogManager} from "../../log/logManager";
import {Vcs} from "../../types/vcs";
import {BuildGeneralInfo, Status} from "../../types/buildGeneralinfo";
import {GeneralInfo} from "../../types/generalInfo";
import {DependenciesTreeNode} from "../../treeDataProviders/dependenciesTree/dependenciesTreeNode";
import * as vscode from "vscode";

export class BuildsUtils {
    public static readonly BUILD_STATUS_PROP: string = "buildInfo.env.JFROG_BUILD_STATUS";

    public static readonly BUILD_RET_ERR_FMT: string = "Couldn't retrieve build information for build '%s/%s'.";
    public static readonly DEPENDENCIES_NODE: string = "dependencies";
    public static readonly ARTIFACTS_NODE: string = "artifacts";

    public static createBuildGeneralInfo(build: any, logger: LogManager): BuildGeneralInfo {
        let vcsList: Vcs[] = build.vcs;
        if (!vcsList) {
            logger.logMessage(`Build '${build.name}/${build.number}' does not contain the branch VCS information.`, 'DEBUG');
            vcsList = [new Vcs()];
        }
        const status: string = build?.properties?.BUILD_STATUS_PROP || '';
        const started: Date | null = build.started ? new Date(build.started) : null ;
        return new BuildGeneralInfo(build.name, build.number, build.url, [], '', started, BuildsUtils.getStatusFromString(status), vcsList[0]); // todo check order
    }

    public static getStatusFromString(status: string): Status {
        switch (status) {
            case "PASS":
                return Status.PASSED;
            case "FAIL":
                return Status.FAILED;
            default:
                return Status.UNKNOWN;
        }
    }

    public static createArtifactsNode(): DependenciesTreeNode {
        return new DependenciesTreeNode(new GeneralInfo(BuildsUtils.ARTIFACTS_NODE,  '', [], '', "Module artifacts"), vscode.TreeItemCollapsibleState.Collapsed);
    }

    public static createDependenciesNode(): DependenciesTreeNode {
        return new DependenciesTreeNode(new GeneralInfo(BuildsUtils.DEPENDENCIES_NODE,  '', [], '', 'Module dependencies'), vscode.TreeItemCollapsibleState.Collapsed);
    }

    public static getArtifactIdFromCompId(componentId:string): string {
        return componentId.substring(0, componentId.lastIndexOf(":"));
    }

    public static getVersionFromCompId(componentId:string): string {
        return componentId.substring(componentId.lastIndexOf(":")+1);
    }
}