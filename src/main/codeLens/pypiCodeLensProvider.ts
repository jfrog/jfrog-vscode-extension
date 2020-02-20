import * as vscode from 'vscode';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { PypiUtils } from '../utils/pypiUtils';

export class PypiCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(PypiUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        // In the requirements files the requirements starts from line 0.
        // Therefore, unlike package.json where we search for 'dependencies:', here its enough to open requirements.txt at line 0.
        return [new vscode.Position(0, 0), new vscode.Position(0, 0)];
    }
}
