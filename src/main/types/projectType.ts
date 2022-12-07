export enum PackageType {
    UNKNOWN,
    GO,
    MAVEN,
    NPM,
    YARN,
    NUGET,
    PYTHON
}

export function toPackgeType(str: string): PackageType {
    switch (str.toUpperCase()) {
        case 'GO':
            return PackageType.GO;
        case 'MAVEN':
            return PackageType.MAVEN;
        case 'NPM':
            return PackageType.NPM;
        case 'YARN':
            return PackageType.YARN;
        case 'NUGET':
            return PackageType.NUGET;
        case 'PYTHON':
            return PackageType.PYTHON;
        default:
            return PackageType.UNKNOWN;
    }
}
