export class ContextKeys {
    public static SHOW_IN_PROJECT_DESC_ENABLED: string = 'jfrog.xray.showInProjectDesc.enabled';
    /*************************************************************
     * The following logic is part of the CVE applicability scan.*
     * It will be hidden until it is officially released.        *
     * ***********************************************************
     */
    // public static SHOW_IN_SOURCE_CODE_ENABLED: string = 'jfrog.source.code.scan.jumpToSource.enabled';
    public static EXCLUDE_DEPENDENCY_ENABLED: string = 'jfrog.xray.excludeDependency.enabled';
    public static UPDATE_DEPENDENCY_ENABLED: string = 'jfrog.xray.updateDependency.enabled';
}
