export class ContextKeys {
    public static SHOW_IN_PROJECT_DESC_ENABLED: string = 'jfrog.xray.showInProjectDesc.enabled';
    public static SHOW_IN_SOURCE_CODE_ENABLED: string = 'jfrog.source.code.scan.jumpToSource.enabled';
    public static EXCLUDE_DEPENDENCY_ENABLED: string = 'jfrog.xray.excludeDependency.enabled';
    public static UPDATE_DEPENDENCY_ENABLED: string = 'jfrog.xray.updateDependency.enabled';
    public static SET_SESSION_STATUS_KEY: string = 'jfrog.connection.status';
    public static SET_SCAN_IN_PROGRESS_KEY: string = 'jfrog.scanInProgress';
    public static SET_CONTEXT_KEY: string = 'setContext';
}

export enum SessionStatus {
    SignedOut = 'signedOut',
    SignedIn = 'signedIn'
}

export enum ExtensionMode {
    Local = 'isLocal',
    Ci = 'isCi'
}
