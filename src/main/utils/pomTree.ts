export class PomTree {
    constructor(
        private _pomId: string = '',
        private _rawDependencies: string = '',
        private _pomPath: string = '',
        private _children: PomTree[] = [],
        private _parent?: PomTree,
        private _parentId: string = ''
    ) {}

    public get pomId(): string {
        return this._pomId;
    }
    
    public get rawDependencies(): string {
        return this._rawDependencies;
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

    public set rawDependencies(v: string) {
        this._rawDependencies = v;
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
}
