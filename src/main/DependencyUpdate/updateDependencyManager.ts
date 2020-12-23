import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';
import { MavenUpdateDependency } from './mavenDependencyUpdate';
import { NpmUpdateDependency } from './npmUpdateDependency';

/**
 * Update the dependency version in the project descriptor (i.e pom.xml) file after right click on the components tree and a left click on "Update dependency to fixed version".
 */
export class UpdateDependencyManager implements ExtensionComponent {
    private updateDependency: AbstractUpdateDependency[] = [];

    constructor(treesManager: TreesManager) {
        this.updateDependency.push(new MavenUpdateDependency(treesManager), new NpmUpdateDependency(treesManager));
    }

    public activate(context: vscode.ExtensionContext) {
        return this;
    }

    public async updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode) {
        const chosedFixedVersion: string = await this.getFixedVersion(dependenciesTreeNode);
        this.updateDependency
            .filter(node => node.isMatched(dependenciesTreeNode))
            .forEach(node => node.updateDependencyVersion(dependenciesTreeNode, chosedFixedVersion));
    }
    /**
     * Returns the version to be updated for dependenciesTreeNode. If more than one version exists,
     * a quick  pick will appear to the user and a list of versions will be shown, the chosen version will be returned.
     */
    public async getFixedVersion(dependenciesTreeNode: DependenciesTreeNode) {
        let fixedVersions: Collections.Set<string> = new Collections.Set<string>();
        dependenciesTreeNode.issues.forEach(issue => {
            if (issue.component === dependenciesTreeNode.componentId) {
                issue.fixedVersions.forEach(fixedVersion => fixedVersions.add(fixedVersion));
            }
        });
        let uniqueFixedVersions: string[] = fixedVersions.toArray();
        switch (fixedVersions.size()) {
            case 0:
                return '';
            case 1:
                return uniqueFixedVersions[0];
            default:
                let chosenFixedVersion: string =
                    (await vscode.window.showQuickPick(uniqueFixedVersions, {
                        canPickMany: false,
                        placeHolder: `Choose a fixed version for '` + dependenciesTreeNode.componentId + `'`
                    })) || '';
                return uniqueFixedVersions.indexOf(chosenFixedVersion) === -1 ? '' : chosenFixedVersion;
        }
    }
}
