import { MavenUtils } from './mavenUtils';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ContextUtils } from './contextUtils';
import * as path from 'path';

export class PomTree {
    constructor(
        private _pomGav: string = '',
        private _pomPath: string = '',
        private _children: PomTree[] = [],
        private _parent?: PomTree,
        private _parentGav: string = ''
    ) {}

    public get pomGav(): string {
        return this._pomGav;
    }

    public get pomPath(): string {
        return this._pomPath;
    }

    public get children(): PomTree[] {
        return this._children;
    }

    public get parent(): PomTree | undefined {
        return this._parent;
    }

    public get parentGav(): string {
        return this._parentGav;
    }

    public set pomGav(v: string) {
        this._pomGav = v;
    }

    public set pomPath(v: string) {
        this._pomPath = v;
    }

    public set children(v: PomTree[]) {
        this._children = v;
    }

    public set parent(v: PomTree | undefined) {
        this._parent = v;
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
            pom.deepSearch(pomGav);
        }
        return;
    }
    public runMavenDependencyTree(): void {
        MavenUtils.executeMavenCmd(`mvn dependency:tree -DappendOutput=true -DoutputFile=.jfrog_vscode/maven`, this.pomPath);
    }

    public getRawDependencies(treesManager: TreesManager): string[] | undefined {
        const dependencyTreeFile: string = path.join(this._pomPath, '.jfrog_vscode', 'maven');
        try {
            const pomContent: string | undefined = ContextUtils.readFileIfExists(dependencyTreeFile);
            if (!pomContent) {
                throw new Error();
            }
            const pomDependencies: string | undefined = pomContent?.substring(pomContent.indexOf('\n') + 1);
            return pomDependencies.split(/\r?\n/).filter(line => line.trim() !== '');
        } catch (error) {
            treesManager.logManager.logMessage('Dependencies were not found. at pom.xml.\n' + this._pomPath + '.', 'ERR');
        } finally {
            ContextUtils.removeFile(path.join(dependencyTreeFile, '..'));
        }
        return;
    }
}
