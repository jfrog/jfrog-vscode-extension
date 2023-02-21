import { ScanCancellationError } from './scanUtils';

interface TasksBundle {
    activeTasks: number;
    tasks: Promise<any>[];
    signal: AbortSignal;
    checkInterval: number;
}

export class RunUtils {
    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises resolve, or rejected when any Promise is rejected or if a given abort signal was given.
     * @param abortSignal - the signal that can abort and reject all the given promises
     * @param abortCheckInterval - the interval in milliseconds to check if an abort signal was fired
     * @param promises - the promises that the new promise will wrap
     * @returns Promise that wrap the given promises
     */
    public static async withAbortSignal(abortSignal: AbortSignal, abortCheckInterval: number, ...promises: Promise<any>[]): Promise<any[]> {
        let bundle: TasksBundle = {
            activeTasks: promises.length,
            tasks: [],
            signal: abortSignal,
            checkInterval: abortCheckInterval
        };
        // Add async tasks to execute
        for (let task of promises) {
            bundle.tasks.push(task.finally(() => bundle.activeTasks--));
        }
        // Add abort task to execute and stop the other tasks if abort signal was given
        bundle.tasks.push(this.checkIfAbortedTask(bundle));
        return (await Promise.all(bundle.tasks)).slice(0,promises.length);
    }

    /**
     * Async task that checks if an abort signal was given.
     * If the active task is <= 0 the task is completed
     * @param tasksBundle - an object that holds the information about the active async tasks count and the abort signal for them
     */
    private static async checkIfAbortedTask(tasksBundle: TasksBundle): Promise<void> {
        while (tasksBundle.activeTasks > 0) {
            if (tasksBundle.signal.aborted) {
                throw new ScanCancellationError();
            }
            await this.delay(tasksBundle.checkInterval);
        }
    }

    /**
     * Sleep and delay task for sleepIntervalMilliseconds
     * @param sleepIntervalMilliseconds - the amount of time in milliseconds to wait
     */
    private static async delay(sleepIntervalMilliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sleepIntervalMilliseconds));
    }
}
