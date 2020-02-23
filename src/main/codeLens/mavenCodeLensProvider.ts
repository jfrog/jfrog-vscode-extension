import * as vscode from 'vscode';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { DOCUMENT_SELECTOR, getDependenciesPos } from '../utils/mavenUtils';

export class MavenCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return getDependenciesPos(document);
    }
}
