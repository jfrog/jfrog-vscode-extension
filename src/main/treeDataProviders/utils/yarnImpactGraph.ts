import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { ScanUtils } from '../../utils/scanUtils';
import { LogManager } from '../../log/logManager';

export type YarnWhyItem = StepItem | InfoItem;

/**
 * Represents a step item in the "yarn why" output.
 */
interface StepItem {
    type: 'list';
    data: ListData;
}

/**
 * Represents an info item in the "yarn why" output.
 */
interface InfoItem {
    type: 'info';
    data: string;
}

/**
 * Represents data within a step item, specifically a list of reasons.
 */
interface ListData {
    type: 'reasons';
    items: string[];
}
/**
 * Utility class for creating an impact graph based on "yarn why" command output.
 */
export class YarnImpactGraphCreator {
    /**
     * Creates an instance of YarnImpactGraphUtil.
     * @param _dependencyName - The name of the impact dependency.
     * @param _dependencyVersion - The version of the impact dependency.
     * @param _projectName - The name of the project.
     * @param _workspaceFolder - The folder where the project is located.
     */
    constructor(
        private _dependencyName: string,
        private _dependencyVersion: string,
        private _projectName: string,
        private _workspaceFolder: string,
        private _logManager: LogManager
    ) {}

    /**
     * Creates and returns an impact graph based on "yarn why" command output.
     * @returns An impact graph.
     */
    public create(): IImpactGraph {
        const dependencyChain: string[] = this.findDependencyChain(this.runYarnWhy());
        if (dependencyChain.length > 0) {
            return this.createImpactGraphFromChains(dependencyChain);
        }

        return {} as IImpactGraph;
    }

    /**
     * Finds the dependency chain, aka, the path from the dependency to the root, based on the supplied "yarn why" command output.
     * The dependency chain may appear as a part of a text or in a list of reasons.
     *
     * Example 1 (Text):
     * {"type":"info","data":"This module exists because \"jest-cli#istanbul-api#mkdirp\" depends on it."}
     *
     * Example 2 (List):
     * {"type":"list","data":{"type":"reasons","items":["Specified in \"dependencies\"","Hoisted from \"jest-cli#node-notifier#minimist\"","Hoisted from \"jest-cli#sane#minimist\""]}}
     *
     * @param output - The "yarn why" command output to analyze.
     * @returns A list of vulnerable dependency chains to the root.
     */
    private findDependencyChain(output: YarnWhyItem[]): string[] {
        const startIndex: number | undefined = this.findDependencyPosition(this._dependencyVersion, output);
        // Zero could be a valid index
        if (startIndex === undefined) {
            return [];
        }
        for (let i: number = startIndex + 1; i < output.length; i++) {
            const item: YarnWhyItem = output[i];
            switch (item.type) {
                case 'list':
                    return this.extractMultipleChain(item.data.items);
                case 'info':
                    if (item.data.startsWith('This module exists because')) {
                        return this.extractMultipleChain([item.data]);
                    }
            }
        }

        return [];
    }

    /**
     * Dependency may present in multiple versions in yarn why output, therefore, finds the position of the specified version in the "yarn why" command output.
     * @param version - The version to search for.
     * @param output - The "yarn why" command output to search within.
     * @returns The index of the found version or undefined if not found.
     */
    private findDependencyPosition(version: string, output: YarnWhyItem[]): number | undefined {
        for (let i: number = 0; i < output.length; i++) {
            const item: YarnWhyItem = output[i];
            if (item.type === 'info' && item.data.includes(version)) {
                this._logManager.debug('found dependency version ' + version + " from 'yarn why' at: " + item.data);
                return i;
            }
        }
        return undefined;
    }

    /**
     * Extracts multiple dependency chains from a list raw dependency string.
     * @param list - An array of strings representing raw dependency chains.
     * @returns An array of extracted dependency chains.
     *
     * Example input - ["Specified in \"dependencies\"","Hoisted from \"jest-cli#node-notifier#minimist\"","Hoisted from \"jest-cli#sane#minimist\""]
     * Example output - ["minimist","jest-cli#node-notifier#minimist","jest-cli#sane#minimist"]
     */
    private extractMultipleChain(list: string[]): string[] {
        const results: string[] = [];
        list.forEach(item => {
            const chain: string | undefined = this.extractChain(item);
            if (chain) {
                this._logManager.debug("found dependency chain'" + chain + "' from" + item);
                results.push(chain);
            }
        });
        return results;
    }

    /**
     * Extracts a single dependency chain from a raw dependency string.
     * @param rawDependencyChain - The raw dependency chain string.
     * @returns The extracted dependency chain or undefined if not found.
     */
    private extractChain(rawDependencyChain: string): string | undefined {
        if (rawDependencyChain.toLowerCase().includes('specified in')) {
            return this._dependencyName;
        }
        // Extract the path from the dependency chain using quotes
        const startIndex: number = rawDependencyChain.indexOf('"');
        const endIndex: number = rawDependencyChain.indexOf('"', startIndex + 1);
        if (startIndex !== -1 && endIndex !== -1) {
            return rawDependencyChain.substring(startIndex + 1, endIndex);
        }
        return undefined;
    }

    /**
     * Creates an impact graph based on a list of dependency chains.
     * @param chains - An array of dependency chains as strings.
     * @returns An impact graph object.
     */
    private createImpactGraphFromChains(chains: string[]): IImpactGraph {
        const trees: IImpactGraphNode[] = [];
        for (let index: number = 0; index < chains.length && index < RootNode.IMPACT_PATHS_LIMIT; index++) {
            trees.push(this.createImpactGraphNodeFromChain(chains[index]));
        }
        return {
            root: this.mergeAllTrees(trees),
            pathsCount: Math.min(RootNode.IMPACT_PATHS_LIMIT, chains.length),
            pathsLimit: RootNode.IMPACT_PATHS_LIMIT
        } as IImpactGraph;
    }

    /**
     * Merges two impact graph trees into a single tree.
     * @param root1 - The root of the first tree to be merged.
     * @param root2 - The root of the second tree to be merged.
     * @returns The merged impact graph tree.
     */
    public mergeTrees(root1: IImpactGraphNode | null, root2: IImpactGraphNode | null): IImpactGraphNode | null {
        if (!root1 || !root2) {
            return root1 || root2;
        }
        // Create a merged node with the same name
        const mergedNode: IImpactGraphNode = { name: root1.name };

        // Merge the children recursively
        if (root1.children && root2.children) {
            const mergedChildren: IImpactGraphNode[] = [];

            for (const child1 of root1.children) {
                const matchingChild2: IImpactGraphNode | undefined = root2.children.find(child2 => child2.name === child1.name);

                if (matchingChild2) {
                    const tree: IImpactGraphNode | null = this.mergeTrees(child1, matchingChild2);
                    if (tree) {
                        mergedChildren.push(tree);
                    }
                } else {
                    // If not found in root2, keep the child from root1
                    mergedChildren.push(child1);
                }
            }

            for (const child2 of root2.children) {
                const matchingChild1: IImpactGraphNode | undefined = root1.children.find(child1 => child1.name === child2.name);

                if (!matchingChild1) {
                    // Add children from root2 that are not present in root1
                    mergedChildren.push(child2);
                }
            }

            mergedNode.children = mergedChildren;
        } else if (root1.children) {
            mergedNode.children = root1.children;
        } else {
            mergedNode.children = root2.children;
        }

        return mergedNode;
    }

    /**
     * Merges multiple impact graph trees into a single tree.
     * @param trees - An array of impact graph trees.
     * @returns The merged impact graph tree.
     */
    public mergeAllTrees(trees: IImpactGraphNode[]): IImpactGraphNode | null {
        if (trees.length === 0) {
            return null;
        }

        let mergedTree: IImpactGraphNode | null = trees[0];

        for (let i: number = 1; i < trees.length; i++) {
            mergedTree = this.mergeTrees(mergedTree, trees[i]);
        }
        return mergedTree;
    }

    /**
     * Creates an impact graph node from a single dependency chain.
     * @param chain - A single dependency chain as a string.
     * @returns An impact graph node.
     */
    private createImpactGraphNodeFromChain(chain: string): IImpactGraphNode {
        const splitted: string[] = chain.split('#');
        let currentNode: IImpactGraphNode = { name: this._projectName };
        const root: IImpactGraphNode = currentNode;
        for (const item of splitted) {
            const child: IImpactGraphNode = { name: item };
            currentNode.children = [child];
            currentNode = child;
        }
        if (currentNode.name !== this._dependencyName) {
            currentNode.children = [{ name: this._dependencyName + ':' + this._dependencyVersion }];
        } else {
            currentNode.name = this._dependencyName + ':' + this._dependencyVersion;
        }
        return root;
    }

    /**
     * Executes the "yarn why" command and parses its JSON output.
     */
    protected runYarnWhy(): YarnWhyItem[] {
        const cmd: string = 'yarn why --json --no-progress ' + this._dependencyName;
        this._logManager.debug('Running ' + cmd + ' at ' + this._workspaceFolder);
        const output: string = ScanUtils.executeCmd(cmd, this._workspaceFolder).toString();
        this._logManager.debug('yarn why output ' + output);
        return output
            .split('\n')
            .filter(line => line.trim() !== '')
            .map((line: string) => JSON.parse(line));
    }
}
