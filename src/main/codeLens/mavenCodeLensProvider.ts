import * as vscode from 'vscode';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';

export class MavenCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(MavenUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        return MavenUtils.getDependenciesPos(document);
    }
}
