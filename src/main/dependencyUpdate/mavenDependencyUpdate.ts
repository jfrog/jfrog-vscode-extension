import * as fs from 'fs';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import { ScanUtils } from '../utils/scanUtils';
import { PackageType } from '../types/projectType';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';

/**
 * Represents a Maven dependency update implementation.
 */
export class MavenDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Maven);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const [groupId, artifactId] = MavenUtils.getGavArray(dependency);

        // Try to get versions property if exists
        const fileContent: string = fs.readFileSync(dependency.getDependencyFilePath(), 'utf-8');
        const versionProperty: string | undefined = this.matchVersionProperty(MavenUtils.getDependencyXmlTag(fileContent, groupId, artifactId));

        ScanUtils.executeCmd(this.buildUpdateCmd(groupId, artifactId, version, versionProperty), dependency.getDependencyProjectPath());
    }

    /**
     * Matches the version property from the XML tag.
     * @param xmlTag The XML tag to match the version property from.
     * @returns The matched version property, if found.
     */
    private matchVersionProperty(xmlTag: string): string | undefined {
        return xmlTag.match(/<version>\$\{(.*)\}<\/version>/)?.[1];
    }

    /**
     * Builds the Maven update command based on the provided parameters.
     * @param groupId The group ID of the dependency.
     * @param artifactId The artifact ID of the dependency.
     * @param newVersion The new version to set.
     * @param versionProperty The version property to update if exists.
     */
    private buildUpdateCmd(groupId: string, artifactId: string, newVersion: string, versionProperty?: string) {
        if (versionProperty) {
            return 'mvn versions:set-property -DgenerateBackupPoms=false -DnewVersion=' + newVersion + ' -Dproperty=' + versionProperty;
        }
        return 'mvn versions:use-dep-version -DgenerateBackupPoms=false -Dincludes=' + groupId + ':' + artifactId + ' -DdepVersion=' + newVersion;
    }
}
