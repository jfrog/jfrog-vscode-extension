import { ScanTimeoutError } from './scanUtils';

export interface Task<T> {
    title: string;
    task: Promise<T>;
}

export class RunUtils {
    // every 0.1 sec
    private static readonly CHECK_INTERVAL_MILLISECS: number = 100;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises resolve, or rejected when:
     * 1. Any Promise is rejected.
     * 2. Cancel was requested.
     * 3. Timeout reached.
     * @param timeout - time in millisecs until execution timeout
     * @param checkCancel - check if cancel was requested
     * @param tasks - the promises that the new promise will wrap
     * @returns Promise that wrap the given promises
     */
    static async runWithTimeout<T>(timeout: number, checkCancel: () => void, ...tasks: (Promise<T> | Task<T>)[]): Promise<T[]> {
        let results: T[] = [];
        const wrappedTasks: Promise<T>[] = <Promise<T>[]>tasks.map(async (task, index) => {
            let result: T = <T>await Promise.race([
                // Add task from argument
                !(task instanceof Promise) && task.task ? task.task : task,
                // Add task to check if cancel was requested from the user or reached timeout
                this.checkCancelAndTimeoutTask(!(task instanceof Promise) && task.title ? task.title : '' + (index + 1), timeout, checkCancel)
            ]);
            results.push(result);
        });
        await Promise.all(wrappedTasks);
        return results;
    }

    /**
     * Async task that checks if an abort signal was given.
     * If the active task is <= 0 the task is completed
     * @param tasksBundle - an object that holds the information about the active async tasks count and the abort signal for them
     */
    private static async checkCancelAndTimeoutTask(title: string, timeout: number, checkCancel: () => void): Promise<void> {
        let checkInterval: number = timeout < RunUtils.CHECK_INTERVAL_MILLISECS ? timeout : RunUtils.CHECK_INTERVAL_MILLISECS;
        for (let elapsed: number = 0; elapsed < timeout; elapsed += checkInterval) {
            checkCancel();
            await this.delay(checkInterval);
        }
        throw new ScanTimeoutError(title, timeout);
    }

    /**
     * Sleep and delay task for sleepIntervalMilliseconds
     * @param sleepIntervalMilliseconds - the amount of time in milliseconds to wait
     */
    public static async delay(sleepIntervalMilliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sleepIntervalMilliseconds));
    }
}
