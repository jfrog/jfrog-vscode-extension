import { XrayScanProgress } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../issuesTree/issuesRootTreeNode';
// import { IssuesTreeDataProvider } from '../issuesTree/issuesTreeDataProvider';

export class StepProgress {
    private static readonly MAX_PROGRESS: number = 95;
    private static readonly VERBOSE: boolean = false;

    private currentStepMsg?: string; // undenifie => first step
    private currentStepsDone: number = 0;
    private currentSubstepsCount?: number;

    constructor(
        private test: IssuesRootTreeNode,
        private _totalSteps: number,
        private _log: LogManager,
        private _progress: vscode.Progress<{ message?: string; increment?: number }>,
        public onProgress?: () => void
    ) {}

    public get totalSteps(): number {
        return this._totalSteps;
    }

    // TODO: msg postfix -> step / total steps (starts from 1 -> total include), if bigger -> dont add post (make total optional)
    public startStep(msg: string, subSteps?: number) {
        this.currentStepsDone++;
        this.currentStepMsg = msg + ' (' + this.currentStepsDone + '/' + this._totalSteps + ')';
        this.currentSubstepsCount = subSteps && subSteps > 0 ? subSteps : undefined;
        this._progress.report({ message: msg });
        if (this.onProgress) {
            this.onProgress();
        }
    }

    public get getReportIncValue(): number {
        let incPerStep: number = StepProgress.MAX_PROGRESS / this._totalSteps;
        return this.currentSubstepsCount ? incPerStep / this.currentSubstepsCount : incPerStep;
    }

    public reportProgress(inc: number = this.getReportIncValue) {
        if (this.currentStepMsg) {
            this._progress.report({ message: this.currentStepMsg, increment: inc });
            this.test.test += inc;
            if (StepProgress.VERBOSE) {
                this._log.logMessage('total prgress [' + this.test.workSpace.name + ']: ' + this.test.test, 'DEBUG');
            }
            if (this.onProgress) {
                this.onProgress();
            }
        }
    }
    public createScanProgress(scanName: string): XrayScanProgress {
        // let progressManager: StepProgress = this;
        // let totalIncrement: number = this.currentSubstepsCount ? StepProgress.MAX_PROGRESS / this.currentSubstepsCount : StepProgress.MAX_PROGRESS;
        return new (class implements XrayScanProgress {
            private lastPercentage: number = 0;
            constructor(private _log: LogManager, private _progressManager: StepProgress) {}
            /** @override */
            public setPercentage(percentage: number): void {
                if (percentage != this.lastPercentage) {
                    let inc: number = this._progressManager.getReportIncValue * ((percentage - this.lastPercentage) / 100);
                    if (StepProgress.VERBOSE) {
                        this._log.logMessage(
                            '[' +
                                scanName +
                                '] reported change in progress ' +
                                this.lastPercentage +
                                '% -> ' +
                                percentage +
                                '% (increment = ' +
                                inc +
                                ')',
                            'DEBUG'
                        );
                    }
                    this._progressManager.reportProgress(inc);
                }
                this.lastPercentage = percentage;
            }
        })(this._log, this);
    }
}
