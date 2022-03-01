import { assert } from 'chai';

import * as path from 'path';

import * as fs from 'fs';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';

import { GeneralInfo } from '../../main/types/generalInfo';
import { GoUtils } from '../../main/utils/goUtils';
import { createScanCacheManager } from './utils/utils.test';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { Severity } from '../../main/types/severity';
import { IIssueKey } from '../../main/types/issueKey';
import { CsvVulnerabilitiesExporter } from '../../main/export/csv/csvVulnerabilitiesExporter';
import { AbstractExporter } from '../../main/export/abstractExporter';

/**
 * Test functionality of exports.
 */
describe('Exports Tests', () => {
    let scanCacheManager: ScanCacheManager = createScanCacheManager();
    let resourceDir: string = path.join(__dirname, '..', 'resources', 'export');

    it('Generate vulnerabilities report', async () => {
        let exporter: AbstractExporter = new CsvVulnerabilitiesExporter(createTestTree(), scanCacheManager);
        let data: string = await (await exporter.generateVulnerabilitiesReportData()).trim();
        let expected: string = fs.readFileSync(path.join(resourceDir, 'vulnerabilities.csv'), 'utf8').trim();
        assert.equal(data, expected);
    });

    it('Generate vulnerabilities empty report', async () => {
        let exporter: CsvVulnerabilitiesExporter = new CsvVulnerabilitiesExporter(
            new DependenciesTreeNode(new GeneralInfo('', '', [], '', '')),
            scanCacheManager
        );
        let data: string = await (await exporter.generateVulnerabilitiesReportData()).trim();
        let expected: string = exporter
            .getCsvFields()
            .map(o => '"' + o.label + '"')
            .join(',');
        assert.equal(data, expected);
    });

    function createTestTree(): DependenciesTreeNode {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('root', '1.0.0', [], '', GoUtils.PKG_TYPE));

        let node1: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('node-1', '1.0.0', [], '', GoUtils.PKG_TYPE));
        parent.addChild(node1);

        let node2: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('node-2', '1.1.0', [], '', GoUtils.PKG_TYPE));
        parent.addChild(node2);

        addVulnerabilities(node1, node2);
        return parent;
    }

    function addVulnerabilities(node1: DependenciesTreeNode, node2: DependenciesTreeNode) {
        let issueId1: string = 'XRAY-1';
        scanCacheManager.storeIssue({
            cves: ['CVE-1', 'CVE-11'],
            issueId: issueId1,
            summary: 'Issue 1 summary',
            severity: Severity.Critical,
            fixedVersions: ['2.0.0', '3.0.0']
        } as IIssueCacheObject);
        let issue1: IIssueKey = { issue_id: issueId1, component: 'impacted-1:1.0.0' } as IIssueKey;

        let issueId2: string = 'XRAY-2';
        scanCacheManager.storeIssue({
            cves: ['CVE-2'],
            issueId: issueId2,
            summary: 'Issue 2 summary',
            severity: Severity.Low,
            fixedVersions: ['1.0.0']
        } as IIssueCacheObject);
        let issue2: IIssueKey = { issue_id: issueId2, component: 'impacted-2:1.0.0' } as IIssueKey;

        let issueId3: string = 'XRAY-3';
        scanCacheManager.storeIssue({
            cves: ['CVE-3'],
            issueId: issueId3,
            summary: 'Issue 3 summary',
            severity: Severity.High,
            fixedVersions: ['4.0.0']
        } as IIssueCacheObject);
        let issue3: IIssueKey = { issue_id: issueId3, component: 'impacted-3:1.0.0' } as IIssueKey;

        node1.issues.add(issue1);
        node2.issues.add(issue1);
        node2.issues.add(issue2);
        node2.issues.add(issue3);
    }
});
