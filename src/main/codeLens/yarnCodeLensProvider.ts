import * as vscode from 'vscode';
import { YarnUtils } from '../utils/yarnUtils';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';

export class YarnCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(YarnUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return YarnUtils.getDependenciesPos(document);
    }
}
