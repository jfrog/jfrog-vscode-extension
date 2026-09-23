export interface PythonDescriptor {
    path: string;
    projectName?: string;
    directDependencies: Map<string, string | undefined>;
}
