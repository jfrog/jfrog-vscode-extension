import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import * as fs from 'fs';

export class PythonDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Python);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode);
    }

    /** @override */
    public update(dependenciesTreeNode: DependencyIssuesTreeNode, fixedVersion: string): void {
        const fileContent: string = fs.readFileSync(dependenciesTreeNode.getDependencyFilePath(), 'utf-8');
        const updatedFileContent: string = this.replaceVersions(fileContent, dependenciesTreeNode, fixedVersion);
        fs.writeFileSync(dependenciesTreeNode.getDependencyFilePath(), updatedFileContent);
    }

    private replaceVersions(rawDependencyData: string, dependenciesTreeNode: DependencyIssuesTreeNode, fixedVersion: string) {
        let packageRegex: RegExp = new RegExp(
            // Sample to match regex 'requests [security] >= 2.8.1, == 2.8.* '
            // Capturing group that matches the value of the name property of the dependenciesTreeNode: 'requests'
            `(${dependenciesTreeNode.name})` +
                // Capturing a set of 'extras' that serve to install optional dependencies: [security]
                '\\s*(?:\\[.*\\])?\\s*' +
                // Capturing any number of comparison operation with the version: = 2.8.1, == 2.8.*
                '(' +
                '(?:' +
                '\\s*(?:[<>]=?|!=|===?|~=)' +
                '\\s*' +
                // Match any digit / word / start (*) / dot (.)
                '[\\d\\w*-.]+' +
                // Optional comma
                ',?' +
                ')' +
                '*)',
            'gis'
        );
        // To replace only the version without modify the dependency name, since the name is capture, we use $1 to refer it.
        return rawDependencyData.replace(packageRegex, `$1==${fixedVersion}`);
    }
}
