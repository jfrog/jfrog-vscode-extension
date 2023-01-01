export enum PackageType {
    Unknown,
    Go,
    Maven,
    Npm,
    Yarn,
    Nuget,
    Python
}

export function getNumberOfSupportedPackgeTypes(): number {
    return Object.keys(PackageType).length - 1;
}

export function toPackgeType(str: string): PackageType {
    switch (str.toUpperCase()) {
        case 'GO':
            return PackageType.Go;
        case 'MAVEN':
            return PackageType.Maven;
        case 'NPM':
            return PackageType.Npm;
        case 'YARN':
            return PackageType.Yarn;
        case 'NUGET':
            return PackageType.Nuget;
        case 'PYTHON':
            return PackageType.Python;
        default:
            return PackageType.Unknown;
    }
}
