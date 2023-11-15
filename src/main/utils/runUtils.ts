export class RunUtils {
    /**
     * Sleep and delay task for sleepIntervalMilliseconds
     * @param sleepIntervalMilliseconds - the amount of time in milliseconds to wait
     */
    public static async delay(sleepIntervalMilliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sleepIntervalMilliseconds));
    }
}
