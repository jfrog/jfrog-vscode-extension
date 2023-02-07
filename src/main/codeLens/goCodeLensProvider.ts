import * as vscode from 'vscode';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { GoUtils } from '../utils/dependency/goUtils';

export class GoCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(GoUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return GoUtils.getDependenciesPos(document);
    }
}
