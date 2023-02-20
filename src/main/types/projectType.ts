export enum PackageType {
    Unknown,
    Go,
    Maven,
    Npm,
    Yarn,
    Nuget,
    Python
}

export function getNumberOfSupportedPackageTypes(): number {
    return Object.keys(PackageType).length - 1;
}

export function toPackageType(str: string): PackageType {
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
        case 'PYPI':
            return PackageType.Python;
        default:
            return PackageType.Unknown;
    }
}
export function fromPackageType(packageType: PackageType): string {
    switch (packageType) {
        case PackageType.Go:
            return 'Go';
        case PackageType.Maven:
            return 'Maven';
        case PackageType.Npm:
            return 'npm';
        case PackageType.Yarn:
            return 'Yarn';
        case PackageType.Nuget:
            return 'NuGet';
        case PackageType.Python:
            return 'PYPI';
        default:
            return 'Unknown';
    }
}
