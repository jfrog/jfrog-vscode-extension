import glob from 'glob';
import Mocha, { MochaOptions } from 'mocha';
import * as path from 'path';

/**
 * Run extension integration tests with Mocha. All tests must be under 'test/tests/' folder.
 */
export function run(): Promise<void> {
    // Create the mocha test
    const mocha: Mocha = new Mocha({
        color: true,
        timeout: 600000
    } as MochaOptions);

    const testsRoot: string = path.join(__dirname, 'tests');
    return new Promise((resolve, reject) => {
        glob('**/*.test.js', { cwd: testsRoot } as glob.IOptions, (err: Error | null, testFiles: string[]) => {
            if (err) {
                return reject(err);
            }
            // Add files to the test suite
            testFiles.forEach(testFile => mocha.addFile(path.join(testsRoot, testFile)));
            try {
                // Run the mocha test
                mocha.run(failures => (failures > 0 ? reject(new Error(`${failures} tests failed.`)) : resolve()));
            } catch (err) {
                reject(err);
            }
        });
    });
}
