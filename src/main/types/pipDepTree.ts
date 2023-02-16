export interface PipDepTree {
    key: string;
    package_name: string;
    installed_version: string;
    required_version: string;
    dependencies: PipDepTree[];
}
