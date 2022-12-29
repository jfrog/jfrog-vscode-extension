// import * as path from 'path';
// import { assert } from 'chai';
// import { ConnectionManager } from '../../main/connect/connectionManager';
// import { LogManager } from '../../main/log/logManager';
// import { isWindows } from './utils/utils.test';
// import { CveApplicabilityRunner } from '../../main/utils/cveApplicabilityRunner';

// describe('Cve Applicability Runner Tests', () => {
//     let logManager: LogManager = new LogManager().activate();
//     const runner: CveApplicabilityRunner = new CveApplicabilityRunner(new ConnectionManager(logManager), logManager);
//     let projectToScan: string = path.join(__dirname, '..', 'resources', 'cveApplicability', 'project');

//     it('Version test', async () => {
//         await runner.update();
//         assert.isNotEmpty(runner.version());
//     });

//     it('Test version with spaces in home dir path', async () => {
//         let oldHomeDir: string | undefined;
//         if (isWindows()) {
//             oldHomeDir = process.env['USERPROFILE'];
//             process.env['USERPROFILE'] = path.join(__dirname, '..', 'resources', 'home dir');
//         } else {
//             oldHomeDir = process.env['HOME'];
//             process.env['HOME'] = path.join(__dirname, '..', 'resources', 'home dir');
//         }
//         try {
//             const runnerWithDiffHomeDir: CveApplicabilityRunner = new CveApplicabilityRunner(new ConnectionManager(logManager), logManager);
//             await runnerWithDiffHomeDir.update();
//             assert.isNotEmpty(runnerWithDiffHomeDir.version());
//         } finally {
//             if (isWindows()) {
//                 process.env['USERPROFILE'] = oldHomeDir;
//             } else {
//                 process.env['HOME'] = oldHomeDir;
//             }
//         }
//     });

//     it('Scan test', async () => {
//         await runner.update();
//         let cmdOutput: string | undefined = runner.scan(projectToScan);
//         assert.isNotEmpty(cmdOutput);
//         cmdOutput?.includes('CVE-2020-11022');
//         cmdOutput = runner.scan(projectToScan, 'CVE-2020-11022');
//         assert.isNotEmpty(cmdOutput);
//         cmdOutput?.includes('CVE-2020-11022');
//     });
// });
