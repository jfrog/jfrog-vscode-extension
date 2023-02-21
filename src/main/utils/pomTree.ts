import * as path from 'path';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ScanUtils } from './scanUtils';

export class PomTree {
    private _pomLocation: string = '';
    constructor(
        private _pomGav: string = '',
        private _pomPath: string = '',
        private _children: PomTree[] = [],
        private _parent?: PomTree,
        private _parentGav: string = ''
    ) {
        this._pomLocation = path.dirname(_pomPath);
    }

    public get pomGav(): string {
        return this._pomGav;
    }

    public set pomGav(v: string) {
        this._pomGav = v;
    }

    public get pomPath(): string {
        return this._pomPath;
    }

    public set pomPath(v: string) {
        this._pomPath = v;
        this._pomLocation = path.dirname(v);
    }

    public get pomLocation(): string {
        return this._pomLocation;
    }

    public get children(): PomTree[] {
        return this._children;
    }

    public set children(v: PomTree[]) {
        this._children = v;
    }

    public get parent(): PomTree | undefined {
        return this._parent;
    }

    public set parent(v: PomTree | undefined) {
        this._parent = v;
    }

    public get parentGav(): string {
        return this._parentGav;
    }

    public set parentGav(v: string) {
        this._parentGav = v;
    }

    public addChild(v: PomTree) {
        this._children?.push(v);
    }

    public deepSearch(pomGav: string): PomTree | undefined {
        if (this.pomGav === pomGav) {
            return this;
        }
        for (const pom of this._children) {
            return pom.deepSearch(pomGav);
        }
        return;
    }
    public runMavenDependencyTree(): void {
        ScanUtils.executeCmd(`mvn dependency:tree -DappendOutput=true -DoutputFile=.jfrog_vscode/maven`, this.pomLocation);
    }

    public async getRawDependencies(treesManager: TreesManager): Promise<string[] | undefined> {
        const dependencyTreeFile: string = path.join(this.pomLocation, '.jfrog_vscode', 'maven');
        try {
            const pomContent: string | undefined = ScanUtils.readFileIfExists(dependencyTreeFile);
            if (!pomContent) {
                throw new Error();
            }
            const pomDependencies: string | undefined = pomContent?.substring(pomContent.indexOf('\n') + 1);
            return pomDependencies.split(/\r?\n/).filter(line => line.trim() !== '');
        } catch (error) {
            treesManager.logManager.logMessage(
                'Dependencies were not found at ' +
                    path.join(this.pomLocation, 'pom.xml') +
                    '.\n' +
                    "Hint: For projects which include the 'org.apache.maven.plugins:maven-dependency-plugin' the scanning functionality is disabled",
                'ERR'
            );
        } finally {
            await ScanUtils.removeFolder(path.join(dependencyTreeFile, '..'));
        }
        return;
    }
}
