import fs from 'fs-extra';
import path from 'path';
import { runTests } from 'vscode-test';
import { TestOptions } from 'vscode-test/out/runTest';

let targetResourcesDir: string = path.join(__dirname, 'resources');

/**
 * Prepare the VS Code test environment and run the integration tests.
 */
async function main() {
    try {
        // The folder containing the Extension package.json
        const extensionDevelopmentPath: string = path.join(__dirname, '..', '..');

        // The path to test runner
        const extensionTestsPath: string = path.join(__dirname, 'index');

        // Download VS Code, unzip it and run the integration tests
        const maxRetries: number = 3;
        let retryCount: number = 0;
        
        while (retryCount < maxRetries) {
          try {
            let exitCode: number = await runTests({
              version: 'insiders',
              extensionDevelopmentPath,
              extensionTestsPath,
              launchArgs: ['--disable-extensions', '-n', targetResourcesDir]
            } as TestOptions);
            console.log(`Test execution (runTests) finished with exit code: ${exitCode}.`);
             // No error occurred, exit the loop
            break;
          } catch (error: any) {
            if (error.toString().includes('read ECONN') || (error.message && error.message.includes('read ECONN'))) {
              retryCount++;
              console.log(`Error occurred: ${error}. Retrying (${retryCount}/${maxRetries})...`);
            } else {
              throw error;
            }
          }
        }
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

/**
 * Copy 'src/test/resources' directory to 'out/test/resources'
 */
async function createResourcesDir() {
    const resourcesDir: string = path.join(__dirname, '..', '..', 'src', 'test', 'resources');
    console.log('Deleting if exist: ' + targetResourcesDir);
    fs.removeSync(targetResourcesDir);
    console.log('Copying ' + resourcesDir + ' to ' + targetResourcesDir);
    fs.copySync(resourcesDir, targetResourcesDir);
}

createResourcesDir();
main();
