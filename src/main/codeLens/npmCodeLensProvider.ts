import * as vscode from 'vscode';
import { NpmUtils } from '../utils/npmUtils';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';

export class NpmCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(NpmUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return NpmUtils.getDependenciesPos(document);
    }
}
