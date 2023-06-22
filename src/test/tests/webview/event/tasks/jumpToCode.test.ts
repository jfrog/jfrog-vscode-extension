import { IAnalysisStep } from 'jfrog-ide-webview';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { LogManager } from '../../../../../main/log/logManager';
import { ScanUtils } from '../../../../../main/utils/scanUtils';
import { JumpToCodeTask } from '../../../../../main/webview/event/tasks/jumpToCode';

describe('JumpToCodeTask', () => {
    const logger: LogManager = new LogManager().activate();

    it('should log a debug message and call ScanUtils.openFile with the correct arguments', () => {
        const logMessageStub: any = sinon.stub(logger, 'logMessage');
        const openFileStub: any = sinon.stub(ScanUtils, 'openFile');

        const mockAnalysisStep: IAnalysisStep = {
            file: 'file-example',
            startRow: 1,
            startColumn: 2,
            endRow: 3,
            endColumn: 4
        };
        const jumpToCodeTask: JumpToCodeTask = new JumpToCodeTask(mockAnalysisStep, logger);

        jumpToCodeTask.run();

        // Assert that the logMessage method was called with the expected arguments
        sinon.assert.calledWith(logMessageStub, `Open file '${mockAnalysisStep.file}'`, 'DEBUG');

        // Assert that the openFile method was called with the expected arguments
        sinon.assert.calledWith(openFileStub, mockAnalysisStep.file, new vscode.Range(0, 1, 2, 3));

        openFileStub.restore();
    });
});
