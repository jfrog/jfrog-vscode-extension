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
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ['--disable-extensions', '-n', targetResourcesDir]
        } as TestOptions);
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
