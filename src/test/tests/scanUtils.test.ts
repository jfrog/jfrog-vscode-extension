import { assert, expect } from 'chai';
import * as exec from 'child_process';
import { ScanUtils } from '../../main/utils/scanUtils';
import sinon from 'sinon';

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
            const result: exec.ChildProcess | undefined = await ScanUtils.executeCmdAsync(command, () => dummyCheckError, undefined, undefined);
            assert.instanceOf(result, exec.ChildProcess);
            assert.isTrue(clearIntervalSpy.calledOnce);
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

        describe('cancelProcess', () => {
            it('should call childProcess.kill when cancellation is requested', () => {
                // Arrange
                const killStub: sinon.SinonStub<any[], any> = sinon.stub();
                const fakeChildProcess: Partial<exec.ChildProcess> = {
                    kill: killStub
                };

                const checkCancellation: () => never = () => {
                    throw new Error('Cancellation requested.');
                };

                // Act
                // Simulating an interval, actual logic not included for this test
                const checkCancellationInterval: NodeJS.Timer = setInterval(() => {
                    return;
                }, 100);
                ScanUtils.cancelProcess(fakeChildProcess as exec.ChildProcess, checkCancellationInterval, checkCancellation, () => {
                    return;
                });

                // Assertions
                assert.isTrue(killStub.calledOnceWithExactly('SIGTERM'));
            });
        });
    });
});
