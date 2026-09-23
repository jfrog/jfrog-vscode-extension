export interface PyprojectToml {
    project?: {
        name?: string;
        dependencies?: string[];
    };
    tool?: {
        poetry?: {
            name?: string;
            dependencies?: { [name: string]: string | { version?: string } };
        };
    };
}
