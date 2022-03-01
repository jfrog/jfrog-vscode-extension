import { ScanCacheManager } from '../../scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { IIssueCacheObject } from '../../types/issueCacheObject';
import { IIssueKey } from '../../types/issueKey';
import { ExportableVulnerability } from '../exportable/exportableVulnerability';
import { CsvExporter } from './csvExporter';
import { CsvField } from './csvField';
import { CsvVulnerabilityRow } from './csvVulnerabilityRow';

export class CsvVulnerabilitiesExporter extends CsvExporter {
    constructor(_root: DependenciesTreeNode, _scanCacheManager: ScanCacheManager) {
        super(_root, _scanCacheManager);
    }

    /** @override */
    getCsvFields(): CsvField[] {
        return [
            new CsvField('severity', CsvVulnerabilitiesExporter.SEVERITY_COL),
            new CsvField('impactedDependencyName', CsvVulnerabilitiesExporter.IMPACTED_DEPENDENCY_COL),
            new CsvField('impactedDependencyVersion', CsvVulnerabilitiesExporter.IMPACTED_DEPENDENCY_VERSION_COL),
            new CsvField('type', CsvVulnerabilitiesExporter.TYPE_COL),
            new CsvField((row: any) => row.fixedVersions?.join(';'), CsvVulnerabilitiesExporter.FIXED_VERSION_COL),
            new CsvField((row: any) => row.directDependencies?.join(';'), CsvVulnerabilitiesExporter.DIRECT_DEPENDENCIES_COL),
            new CsvField((row: any) => row.cves?.join(';'), CsvVulnerabilitiesExporter.CVES_COL),
            new CsvField('issueId', CsvVulnerabilitiesExporter.ISSUE_ID_COL),
            new CsvField('summary', CsvVulnerabilitiesExporter.SUMMARY_COL)
        ];
    }

    /** @override */
    public getProposedFileName(): string {
        return 'vulnerabilities.csv';
    }

    /** @override */
    protected createExportableVulnerability(
        directDependency: DependenciesTreeNode,
        issueKey: IIssueKey,
        issue: IIssueCacheObject
    ): ExportableVulnerability {
        return new CsvVulnerabilityRow(directDependency, issueKey, issue);
    }
}
