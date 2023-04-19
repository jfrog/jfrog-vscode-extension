import { WriteFileOptions } from 'fs';
import { existsSync, writeFileSync } from 'fs-extra';
import glob from 'glob';
import Mocha, { MochaOptions } from 'mocha';
import * as path from 'path';
import { cleanUpIntegrationTests, initializeIntegrationTests } from './tests/utils/testIntegration.test';

/**
 * Run extension integration tests with Mocha. All tests must be under 'test/tests/' folder.
 */
export async function run(): Promise<void> {
    // Create the mocha test
    const mocha: Mocha = new Mocha({
        color: true,
        timeout: 600000
    } as MochaOptions);

    deleteWebviewJs();
    await initializeIntegrationTests();
    const testsRoot: string = path.join(__dirname, 'tests');
    return new Promise<void>((resolve, reject) => {
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
    }).finally(async () => await cleanUpIntegrationTests());
}

/**
 * Temporary workaround for running the tests - delete the content of 'node_modules/jfrog-ide-webview/dist/cjs/index.js'
 */
function deleteWebviewJs(): void {
    const webviewJsPath: string = path.join(__dirname, '..', '..', 'node_modules', 'jfrog-ide-webview', 'dist', 'cjs', 'index.js');
    if (existsSync(webviewJsPath)) {
        writeFileSync(webviewJsPath, '', { flag: 'w' } as WriteFileOptions);
    }
}
