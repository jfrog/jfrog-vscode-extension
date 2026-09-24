export interface PyprojectToml {
    project?: PyprojectProjectTable;
    tool?: {
        poetry?: PyprojectPoetryTable;
    };
}

export interface PyprojectProjectTable {
    name?: string;
    dependencies?: string[];
}

export interface PyprojectPoetryTable {
    name?: string;
    dependencies?: { [name: string]: string | { version?: string } };
}
