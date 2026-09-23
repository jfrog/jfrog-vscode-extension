export interface ParsedPythonDescriptor {
    path: string;
    projectName?: string;
    directDependencies: Map<string, string | undefined>;
}
