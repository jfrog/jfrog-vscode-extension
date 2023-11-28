import { assert, expect } from 'chai';
import { ScanUtils } from '../../main/utils/scanUtils';
import sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { isWindows } from './utils/utils.test';

describe('ScanUtils', () => {
    describe('executeCmdAsync', () => {
        let clearIntervalSpy: sinon.SinonSpy;
        beforeEach(() => {
            clearIntervalSpy = sinon.spy(global, 'clearInterval');
        });

        afterEach(() => {
            clearIntervalSpy.restore();
        });

        const dummyCheckError: () => void = () => {
            return;
        };

        it('should execute a command successfully', async () => {
            const command: string = 'echo Hello, World!';
            const output: string = await ScanUtils.executeCmdAsync(command, () => dummyCheckError, undefined, undefined);
            assert.isTrue(clearIntervalSpy.calledOnce);
            assert.equal(output, 'Hello, World!');
        });

        it('should reject with an error if the command fails', async () => {
            const command: string = 'invalid_command';
            try {
                await ScanUtils.executeCmdAsync(command, dummyCheckError, undefined, undefined);
                // If the above line doesn't throw an error, the test should fail
                expect.fail('The command should have failed.');
            } catch (error) {
                assert.instanceOf(error, Error);
                assert.isTrue(clearIntervalSpy.calledOnce);
            }
        });

        it('should reject with a cancellation error if canceled', async () => {
            const cancelSignal: () => void = () => {
                throw new Error('Cancellation requested.');
            };

            try {
                await ScanUtils.executeCmdAsync('sleep 2', cancelSignal, undefined, undefined);
                // If the above line doesn't throw an error, the test should fail
                expect.fail('The command should have been canceled.');
            } catch (error) {
                if (error instanceof Error) {
                    assert.equal(error.message, 'Cancellation requested.');
                } else {
                    assert.fail('The error should have been an instance of Error.');
                }
            }
        });

        it('should call childProcess.kill when cancellation is requested', async () => {
            const cancelSignal: () => void = () => {
                throw new Error('Cancellation requested.');
            };
            const randomFileName: string = `file_${Date.now()}.txt`;

            // Define the command that waits for 2 seconds and writes a file
            const command: string = isWindows() ? `ping 127.0.0.1 -n 2 & echo > ${randomFileName}` : `sleep 2 && touch ${randomFileName}`;

            try {
                await ScanUtils.executeCmdAsync(command, cancelSignal, __dirname, undefined);
                expect.fail('The command should have been canceled.');
            } catch (error) {
                if (error instanceof Error) {
                    assert.equal(error.message, 'Cancellation requested.');

                    // Wait for 3 seconds to ensure the file is not created
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Check if the file 'output.txt' does not exist (indicating it wasn't written due to process kill)
                    assert.isFalse(fs.existsSync(path.join(__dirname, randomFileName)));
                } else {
                    // Fail the test if the error is not an instance of Error
                    expect.fail('The error should have been an instance of Error.');
                }
            }
        });
    });
});
