import { assert } from 'chai';
import { RunUtils, Task } from '../../main/utils/runUtils';
import { ScanCancellationError, ScanTimeoutError } from '../../main/utils/scanUtils';

describe('Run Utils tests', async () => {
    [
        {
            name: 'Task ended',
            timeout: false,
            shouldAbort: false,
            addTitle: undefined,
            expectedErr: undefined
        },
        {
            name: 'Task aborted',
            timeout: false,
            shouldAbort: true,
            addTitle: undefined,
            expectedErr: new ScanCancellationError()
        },
        {
            name: 'Task timeout with title',
            timeout: true,
            shouldAbort: false,
            addTitle: "'TitledTask'",
            expectedErr: new ScanTimeoutError("'TitledTask'", 100)
        },
        {
            name: 'Task timeout no title',
            timeout: true,
            shouldAbort: false,
            addTitle: undefined,
            expectedErr: new Error()
        },
        {
            name: 'Task throws error',
            timeout: false,
            shouldAbort: false,
            addTitle: undefined,
            expectedErr: new Error('general error')
        }
    ].forEach(async test => {
        it('Run with abort controller - ' + test.name, async () => {
            let tasks: (Promise<number> | Task<number>)[] = [];
            let expectedResults: number[] = [0, 1, 2, 3];

            for (let i: number = 0; i < expectedResults.length; i++) {
                let task: Promise<number> | Task<number> =
                    test.name.includes('Task throws error') && i == expectedResults.length - 1
                        ? RunUtils.delay(200).then(() => {
                              throw new Error('general error');
                          })
                        : RunUtils.delay((expectedResults.length - i) * 200).then(() => {
                              return i;
                          });
                tasks.push(test.addTitle ? ({ title: test.addTitle, task: task } as Task<number>) : task);
            }

            try {
                let activeTasks: Promise<any[]> = RunUtils.runWithTimeout(
                    test.timeout ? 100 : 1000,
                    () => {
                        if (test.shouldAbort) {
                            throw new ScanCancellationError();
                        }
                    },
                    ...tasks
                );
                let actualResults: number[] = await activeTasks;
                if (test.expectedErr) {
                    assert.fail('Expected run to throw error');
                }
                // Make sure all tasks ended
                assert.sameMembers(actualResults, expectedResults);
            } catch (err) {
                if (!test.expectedErr) {
                    assert.fail('Expected run not to throw error but got ' + err);
                }
                if (err instanceof Error) {
                    if (test.timeout && !test.addTitle) {
                        assert.include(err.message, 'timed out after');
                    } else {
                        assert.equal(err.message, test.expectedErr.message);
                    }
                }
            }
        });
    });
});
