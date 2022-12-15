import { XrayScanProgress } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';

export class StepProgress {
    private static readonly MAX_PROGRESS: number = 95;

    private currentStepMsg?: string;
    private currentStepsDone: number = 0;
    private currentSubstepsCount?: number;

    constructor(
        private _totalSteps: number,
        private _progress: vscode.Progress<{ message?: string; increment?: number }>,
        private _log?: LogManager,
        public onProgress?: () => void
    ) {}

    public get totalSteps(): number | undefined {
        return this._totalSteps;
    }

    public startStep(msg: string, subSteps?: number) {
        this.currentStepsDone++;
        this.currentStepMsg = msg + (this._totalSteps > 1 ? ' (' + this.currentStepsDone + '/' + this._totalSteps + ')' : '');
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
            constructor(private _progressManager: StepProgress, private _log?: LogManager) {}
            /** @override */
            public setPercentage(percentage: number): void {
                if (percentage != this.lastPercentage) {
                    let inc: number = this._progressManager.getReportIncValue * ((percentage - this.lastPercentage) / 100);
                    this._log?.logMessage(
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
                    this._progressManager.reportProgress(inc);
                }
                this.lastPercentage = percentage;
            }
        })(this, this._log);
    }
}
