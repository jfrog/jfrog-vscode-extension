import * as vscode from 'vscode';
import { PypiUtils } from '../utils/dependency/pypiUtils';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';

export class PypiCodeLensProvider extends AbstractCodeLensProvider {
    constructor() {
        super(PypiUtils.DOCUMENT_SELECTOR);
    }

    /** @override */
    protected getDependenciesPos(): vscode.Position[] {
        // In the requirements files the requirements starts from line 0.
        // Therefore, unlike package.json where we search for 'dependencies:', here its enough to open requirements.txt at line 0.
        return [new vscode.Position(0, 0), new vscode.Position(0, 0)];
    }
}
