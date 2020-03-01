import * as vscode from 'vscode';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { MavenUtils } from '../utils/mavenUtils';

export class MavenCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(MavenUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return MavenUtils.getDependenciesPos(document);
    }
}
