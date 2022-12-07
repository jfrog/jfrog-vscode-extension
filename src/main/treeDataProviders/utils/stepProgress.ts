import { XrayScanProgress } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';
import { IssuesTreeDataProvider } from '../issuesTree/issuesTreeDataProvider';

export class StepProgress {
    private static readonly MAX_PROGRESS: number = 90;

    private currentStepMsg?: string; // undenifie => first step
    // private currentSubstepsDone: number = 0;
    private currentSubstepsCount?: number;

    constructor(private test: IssuesTreeDataProvider, private _totalSteps: number, private _log: LogManager, private _progress: vscode.Progress<{ message?: string; increment?: number }>, public onChangeCbk?: () => void) {}

    public startStep(msg: string, subSteps?: number) {
        this.currentStepMsg = msg;
        this._progress.report({ message: msg });
        this.currentSubstepsCount = subSteps;
        if (this.onChangeCbk) {
            this.onChangeCbk();
        }
    }

    public get getReportIncValue(): number {
        let incPerStep: number = (StepProgress.MAX_PROGRESS / this._totalSteps);
        return this.currentSubstepsCount ? (incPerStep / this.currentSubstepsCount) : incPerStep;
    }

    public report(inc: number = this.getReportIncValue) {
        if (this.currentStepMsg) {
            this._progress.report({ message: this.currentStepMsg, increment: inc });
            this.test.test += inc;
            this._log.logMessage('total prgress: ' + this.test.test,'DEBUG');
            if (this.onChangeCbk) {
                this.onChangeCbk();
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
                    this._log.logMessage(
                        '[' +
                            scanName +
                            '] reported change in progress ' +
                            this.lastPercentage +
                            '% -> ' +
                            percentage +
                            '% (increment = ' +
                            inc +
                            '% / ' +
                            this._progressManager.getReportIncValue +
                            '%)',
                        'DEBUG'
                    );
                    this._progressManager.report(inc);
                }
                this.lastPercentage = percentage;
            }
        })(this._log, this);
    }
}
