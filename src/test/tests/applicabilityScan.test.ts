import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ApplicabilityRunner, ApplicabilityScanArgs, ApplicabilityScanResponse } from '../../main/scanLogic/scanRunners/applicabilityScan';
import { PackageType } from '../../main/types/projectType';
import { ScanUtils } from '../../main/utils/scanUtils';
import { AnalyzerScanResponse } from '../../main/scanLogic/scanRunners/analyzerModels';

let logManager: LogManager = new LogManager().activate();

describe('Contextual Analysis Scan Tests', async () => {
    const dataDirectory: string = path.join(__dirname, '..', 'resources', 'applicabilityScan');

    [
        {
            name: 'One root',
            roots: ['/path/to/root'],
            cves: [],
            skip: []
        },
        {
            name: 'Multiple roots',
            roots: ['/path/to/root', '/path/to/other'],
            cves: [],
            skip: []
        }
    ].forEach(test => {
        it('Generate Yaml request - ' + test.name, () => {
            let request: ApplicabilityScanArgs = getApplicabilityScanRequest(test.roots, test.cves, test.skip);
            let expected: string = 'scans:\n' + '  - type: ' + request.type + '\n' + '    output: ' + request.output + '\n' + '    roots:\n';
            for (let root of test.roots) {
                expected += '      - ' + root + '\n';
            }
            expected += '    cve-whitelist: ' + request.cve_whitelist + '\n';
            expected += '    skipped-folders: ' + request.skipped_folders + '\n';
            assert.deepEqual(new DummyApplicabilityRunner().requestsToYaml(request), expected);
        });
    });

    [
        {
            type: PackageType.Npm,
            cves: []
        },
        {
            type: PackageType.Python,
            cves: []
        }
    ].forEach(test => {
        it('Scan - ' + test.type, async () => {
            let response: ApplicabilityScanResponse = await new DummyApplicabilityRunner().scan(
                path.join(dataDirectory, test.type.toString().toLowerCase()),
                () => undefined,
                new Set<string>()
            );
            assert.sameDeepMembers(test.cves, response.scannedCve);
        });
    });

    function getApplicabilityScanRequest(roots: string[], cves: string[], skipFolders: string[]): ApplicabilityScanArgs {
        return {
            type: 'analyze-applicability',
            output: '/path/to/output.json',
            roots: roots,
            cve_whitelist: cves,
            skipped_folders: skipFolders
        } as ApplicabilityScanArgs;
    }
});

export class DummyApplicabilityRunner extends ApplicabilityRunner {
    constructor() {
        super({} as ConnectionManager, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, logManager);
    }

    /** @override */
    public async scan(
        directory: string,
        _checkCancel: () => void,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _cveToRun: Set<string> = new Set<string>(),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _skipFolders: string[] = []
    ): Promise<ApplicabilityScanResponse> {
        let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(directory, 'utf8').toString());
        return this.generateResponse(result.runs[0]);
    }
}
