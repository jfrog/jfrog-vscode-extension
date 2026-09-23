import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import * as fs from 'fs';
import * as path from 'path';

export class PythonDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Python);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        // "Update to fixed version" writes the new version into the descriptor with replaceVersions, whose regex only handles
        // setup.py and requirements.txt lines. On a pyproject.toml it would corrupt the TOML, so the update is not offered there.
        const isDeclaredInPyproject: boolean = path.basename(dependenciesTreeNode.getDependencyFilePath()) === 'pyproject.toml';
        return super.isMatched(dependenciesTreeNode) && !isDeclaredInPyproject;
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
