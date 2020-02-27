import { MavenUtils } from './mavenUtils';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ContextUtils } from './contextUtils';
import * as path from 'path';

export class PomTree {
    constructor(
        private _pomId: string = '',
        private _pomPath: string = '',
        private _children: PomTree[] = [],
        private _parent?: PomTree,
        private _parentId: string = ''
    ) {}

    public get pomId(): string {
        return this._pomId;
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

    public get parentId(): string {
        return this._parentId;
    }

    public set pomId(v: string) {
        this._pomId = v;
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

    public set parentId(v: string) {
        this._parentId = v;
    }

    public addChild(v: PomTree) {
        this._children?.push(v);
    }

    public deepSearch(pomId: string): PomTree | undefined {
        if (this.pomId === pomId) {
            return this;
        }
        for (const pom of this._children) {
            pom.deepSearch(pomId);
        }
        return;
    }
    public runMavenDependencyTree(): void {
        MavenUtils.executeMavenCmd(`mvn dependency:tree -DappendOutput=true -DoutputFile=.jfrog/maven`, this.pomPath);
    }

    public getRawDependencies(treesManager: TreesManager): string[] | undefined {
        const dependencyTreeFile: string = path.join(this._pomPath, '.jfrog', 'maven');
        try {
            const pomContent: string | undefined = ContextUtils.readFileIfExists(dependencyTreeFile);
            if (!pomContent) {
                throw new Error('Could not parse dependencies tree');
            }
            const pomDependencies: string | undefined = pomContent?.substring(pomContent.indexOf('\n') + 1);
            return pomDependencies.split(/\r?\n/).filter(line => line.trim() !== '');
        } catch (error) {
            treesManager.logManager.logMessage(
                'Could not get dependencies tree from pom.xml.\n' +
                    'Possible cause: The project needs to be installed by maven. Install it by running "mvn clean install" from ' +
                    this._pomPath +
                    '.',
                'ERR'
            );
        } finally {
            ContextUtils.removeFile(path.join(dependencyTreeFile, '..'));
        }
        return;
    }
}
