import { IssuesTreeDataProvider } from "../../main/treeDataProviders/issuesTree/issuesTreeDataProvider";



/**
* Test functionality of @class IssuesTreeDataProvider.
*/
describe('Issues Tree Data Provider Tests', () => {


    let workspaceFolders: vscode.WorkspaceFolder[] = [];
    let issuesTreeDataProvider: IssuesTreeDataProvider = new IssuesTreeDataProvider(workspaceFolders,);
});