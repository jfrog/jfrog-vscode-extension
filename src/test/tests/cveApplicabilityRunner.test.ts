import * as path from 'path';
import { assert } from 'chai';
import { CveApplicabilityRunner } from '../../main/binary/cveApplicabilityRunner';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';

describe('Cve Applicability Runner Tests', () => {
    let logManager: LogManager = new LogManager().activate();
    const runner: CveApplicabilityRunner = new CveApplicabilityRunner(new ConnectionManager(logManager), logManager);
    let projectToScan: string = path.join(__dirname, '..', 'resources', 'cveApplicability', 'project');

    before(async () => {
        await runner.update();
    });

    it('Version Test', () => {
        assert.isNotEmpty(runner.version());
    });

    it('Scan Test', () => {
        let cmdOutput: string = runner.scan(projectToScan);
        assert.isNotEmpty(cmdOutput);
        cmdOutput.includes('CVE-2020-11022');
        cmdOutput = runner.scan(projectToScan, 'CVE-2020-11022');
        assert.isNotEmpty(cmdOutput);
        cmdOutput.includes('CVE-2020-11022');
    });
});
