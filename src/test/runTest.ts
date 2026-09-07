import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { runTests, TestOptions } from '@vscode/test-electron';

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

        const launchArgs: string[] = ['--disable-extensions', '-n', targetResourcesDir];
        // macOS unix sockets are limited to ~104 bytes; the default .vscode-test path is too long on GHA.
        if (process.platform === 'darwin') {
            launchArgs.push('--user-data-dir', path.join(os.tmpdir(), 'vsc-jfrog-test'));
        }

        // Download VS Code, unzip it and run the integration tests
        let testOptions: TestOptions = {
            version: 'insiders',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs
        };
        if (process.platform === 'win32') {
            testOptions.platform = 'win32-x64-archive';
        } else if (process.platform === 'darwin' && process.arch === 'arm64') {
            testOptions.platform = 'darwin-arm64';
        }
        await runTests(testOptions);
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
