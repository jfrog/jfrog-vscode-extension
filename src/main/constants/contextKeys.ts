export class ContextKeys {
    public static SHOW_IN_PROJECT_DESC_ENABLED: string = 'jfrog.xray.showInProjectDesc.enabled';
    public static SHOW_IN_SOURCE_CODE_ENABLED: string = 'jfrog.source.code.scan.jumpToSource.enabled';
    public static SHOW_IGNORE_RULE_ENABLED: string = 'jfrog.issues.open.ignore.enabled';
    public static EXCLUDE_DEPENDENCY_ENABLED: string = 'jfrog.xray.excludeDependency.enabled';
    public static UPDATE_DEPENDENCY_ENABLED: string = 'jfrog.xray.updateDependency.enabled';
    public static SESSION_STATUS: string = 'jfrog.connection.status';
    public static SCAN_IN_PROGRESS: string = 'jfrog.scanInProgress';
    public static AGNETIC_CODING_ENABLED: string = 'jfrog.agneticCodingEnabled';
    public static VIEW_TYPE: string = 'jfrog.view.type';
    public static COPY_TO_CLIPBOARD_ENABLED: string = 'jfrog.item.copy.to.clipboard';
    public static FIRST_SCAN_STATUS: string = 'jfrog.firstScanInWorkspace';
    public static SET_CONTEXT: string = 'setContext';
    public static VSCODE_AUTOFIX: string = 'jfrog.item.vscode.autofix';
    public static COPILOT_INSTALLED: string = 'jfrog.copilot.installed';
}

export enum SessionStatus {
    SignedOut = 'signedOut',
    connectionLost = 'connectionLost',
    SignedIn = 'signedIn'
}

export enum ExtensionMode {
    Local = 'Local',
    Ci = 'Ci',
    Login = 'Login'
}

export enum FocusType {
    Dependency = 0,
    DependencyVersion = 1
}
