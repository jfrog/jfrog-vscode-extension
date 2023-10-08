import * as fs from 'fs';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import { ScanUtils } from '../utils/scanUtils';
import { PackageType } from '../types/projectType';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';

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
        const [cmd, location] = this.buildUpdateCmd(dependency, version);
        ScanUtils.executeCmd(cmd, location);
    }

    /**
     * Builds the Maven update command based on the provided parameters.
     * @param dependency The dependency to update.
     * @param newVersion The new version to set.
     * @returns The Maven update command.
     **/
    private buildUpdateCmd(dependency: DependencyIssuesTreeNode, newVersion: string): [string, string] {
        const version: string | undefined = this.getDependencyVersionFromPom(dependency);
        if (!version) {
            throw new Error('Failed to find dependency version in pom.xml');
        }
        if (this.isPropertyVersion(version)) {
            const prop: string = this.cleanPropertyVersion(version);
            return [this.buildUpdatePropertyCmd(newVersion, prop), this.searchPropertyFilePath(dependency, prop)];
        }
        return [this.buildUpdateVersionCmd(dependency, newVersion), dependency.getDependencyProjectPath()];
    }

    private isPropertyVersion(version: string): boolean {
        return version.trimStart().startsWith('${');
    }

    /**
     * Cleans the version property from the evaluation tag.
     * @param version The version property to clean.
     * @returns The cleaned version property.
     */
    private cleanPropertyVersion(version: string) {
        return version.substring(version.indexOf('${') + 2, version.indexOf('}'));
    }

    private getDependencyVersionFromPom(dependency: DependencyIssuesTreeNode): string | undefined {
        const [groupId, artifactId] = MavenUtils.getGavArray(dependency);
        const pomXmlContent: string = fs.readFileSync(dependency.getDependencyFilePath(), 'utf-8');
        return this.getVersionProperty(MavenUtils.getDependencyXmlTag(pomXmlContent, groupId, artifactId));
    }

    /**
     * Searches for the version property declaration in the POM files.
     * @param dependency The dependency to search the version property for.
     * @param propName The property name to search.
     * @returns The path to the POM file where the property is declared.
     **/
    private searchPropertyFilePath(dependency: DependencyIssuesTreeNode, propName: string) {
        return this.searchPropDeclareFile(
            // If the there are multi pom project, search in all of them.
            // If not, search in the current pom.
            dependency.parent.parent ? dependency.parent.parent.children : [dependency.parent],
            propName,
            dependency.version
        );
    }

    /**
     * Searches for the property declaration in the POM files.
     * @param files The POM files to search in.
     * @param propName The property name to search.
     * @param propVersion The property version to search.
     * @returns The path to the POM file where the property is declared.
     **/
    private searchPropDeclareFile(files: FileTreeNode[], propName: string, propVersion: string): string {
        for (let mavenProject of files) {
            const pomXmlContent: string = fs.readFileSync(mavenProject.projectFilePath, 'utf-8');
            if (this.matchProperty(pomXmlContent, propName, propVersion)) {
                return mavenProject.getProjectPath();
            }
        }
        throw Error('Failed to find property declaration in pom.xml');
    }

    /**
     * Matches the version property from the XML tag.
     * @param xmlTag The XML tag to match the version property from.
     * @returns The matched version property, if found.
     */
    private getVersionProperty(xmlTag: string): string | undefined {
        return xmlTag.match(/<version>(.*)<\/version>/)?.[1];
    }

    /**
     * Matches the property from the POM text.
     * @param pomText The POM text to match the property from.
     * @param propertyName The property name to match.
     * @param propertyVersion The property version to match.
     * @returns The matched property, if found.
     **/
    private matchProperty(pomText: string, propertyName: string, propertyVersion: string): string | undefined {
        // Create a regular expression pattern to match the property
        const pattern: RegExp = new RegExp(`<${propertyName}>\\s*(${propertyVersion})\\s*</${propertyName}>`, 'i');

        // Use the regular expression to find a match in the POM text
        const match: RegExpMatchArray | null = pomText.match(pattern);
        if (match && match[1]) {
            return match[1];
        } else {
            return undefined;
        }
    }

    /**
     * Builds the Maven update command based on the provided parameters.
     * @param groupId The group ID of the dependency.
     * @param artifactId The artifact ID of the dependency.
     * @param newVersion The new version to set.
     * @param currentProperty The version property to update if exists.
     */
    private buildUpdatePropertyCmd(newVersion: string, propertyName: string) {
        return 'mvn versions:set-property -DgenerateBackupPoms=false -DnewVersion=' + newVersion + ' -Dproperty=' + propertyName;
    }

    /**
     * Builds the Maven update command based on the provided parameters.
     * @param dependency The dependency to update.
     * @param newVersion The new version to set.
     * @returns The Maven update command.
     **/
    private buildUpdateVersionCmd(dependency: DependencyIssuesTreeNode, newVersion: string) {
        const [groupId, artifactId] = MavenUtils.getGavArray(dependency);
        return 'mvn versions:use-dep-version -DgenerateBackupPoms=false -Dincludes=' + groupId + ':' + artifactId + ' -DdepVersion=' + newVersion;
    }
}
