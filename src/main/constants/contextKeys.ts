export class ContextKeys {
    public static SHOW_IN_PROJECT_DESC_ENABLED: string = 'jfrog.xray.showInProjectDesc.enabled';
    public static SHOW_IN_SOURCE_CODE_ENABLED: string = 'jfrog.source.code.scan.jumpToSource.enabled';
    public static EXCLUDE_DEPENDENCY_ENABLED: string = 'jfrog.xray.excludeDependency.enabled';
    public static UPDATE_DEPENDENCY_ENABLED: string = 'jfrog.xray.updateDependency.enabled';
    public static SESSION_STATUS: string = 'jfrog.connection.status';
    public static SCAN_IN_PROGRESS: string = 'jfrog.scanInProgress';
    public static SET_CONTEXT: string = 'setContext';
}

export enum SessionStatus {
    SignedOut = 'signedOut',
    connectionLost = 'connectionLost',
    SignedIn = 'signedIn'
}

export enum ExtensionMode {
    Local = 'isLocal',
    Ci = 'isCi'
}
