import * as vscode from 'vscode';
import {ExtensionComponent} from '../extensionComponent';
import {TreesManager} from '../treeDataProviders/treesManager';
import {BuildGeneralInfo} from "../types/buildGeneralinfo";
import {DependenciesTreeNode} from "../treeDataProviders/dependenciesTree/dependenciesTreeNode";
import {GeneralInfo} from "../types/generalInfo";

/**
 * Manage the filters of the components tree.
 */
export class BuildsManager implements ExtensionComponent {

    constructor(private _treesManager: TreesManager) {

    }

    public activate(context: vscode.ExtensionContext) {
        return this;
    }

    public async showBuildsMenu() {
        let buildsMap: Map<string,GeneralInfo> = this.getBuilds();
        let choice: string | undefined = await vscode.window.showQuickPick(Array.from(buildsMap.keys()), <vscode.QuickPickOptions>{
            placeHolder: 'Build Name',
            canPickMany: false
        });
        if (!!choice) {
            const chosenBuild: BuildGeneralInfo | undefined = <BuildGeneralInfo> buildsMap.get(choice);
            if (!chosenBuild) {
                this._treesManager.logManager.logError(new Error("Failed choosing build"), false);
                return;
            }
            this._treesManager.buildsTreesProvider.loadBuild(chosenBuild, () => {
                this._treesManager.treeDataProviderManager.onChangeFire();
            });
        }
    }

    public getBuilds(): Map<string, GeneralInfo> {
        let buildsMap: Map<string,GeneralInfo> = new Map<string, BuildGeneralInfo>();
        const buildsTree: DependenciesTreeNode = this._treesManager.buildsTreesProvider.allBuildsTree;
        if (!!buildsTree && !!buildsTree.children) {
            for (const build of buildsTree.children) {
                const gi: GeneralInfo = build.generalInfo;
                buildsMap.set(gi.artifactId + ":" + gi.version, gi);
            }
        }
        return buildsMap;
    }
}
