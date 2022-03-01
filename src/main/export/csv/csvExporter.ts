import { Parser } from 'json2csv';
import { ScanCacheManager } from '../../scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { SeverityUtils } from '../../types/severity';
import { ExportableVulnerability } from '../exportable/exportableVulnerability';
import { Exporter } from '../exporter';
import { CsvField } from './csvField';

export abstract class CsvExporter extends Exporter {
    static SEVERITY_COL: string = 'SEVERITY';
    static IMPACTED_DEPENDENCY_COL: string = 'IMPACTED DEPENDENCY';
    static IMPACTED_DEPENDENCY_VERSION_COL: string = 'VERSION';
    static TYPE_COL: string = 'TYPE';
    static FIXED_VERSION_COL: string = 'FIXED VERSIONS';
    static DIRECT_DEPENDENCIES_COL: string = 'DIRECT DEPENDENCIES';
    static CVES_COL: string = 'CVES';
    static ISSUE_ID_COL: string = 'ISSUE ID';
    static SUMMARY_COL: string = 'SUMMARY';

    constructor(_root: DependenciesTreeNode, _scanCacheManager: ScanCacheManager) {
        super(_root, _scanCacheManager);
    }

    /**
     * Returns the CSV column names. Each label is mapped to a property of the export class.
     * Fields will be printed by their order in array.
     *
     * @return Csv fields array.
     */
    abstract getCsvFields(): CsvField[];

    private async createCsvFileFromRows(rows: any[]): Promise<string> {
        let json2csvParser: Parser<any> = new Parser({ fields: this.getCsvFields() });
        let csvData: string = json2csvParser.parse(rows);
        return csvData;
    }

    /** @override */
    public async generateVulnerabilitiesReportData(): Promise<string> {
        let vulnRows: ExportableVulnerability[] = await this.collectVulnerabilities();
        // Compare severity enum to sort from top to bottom.
        vulnRows.sort((a, b) => SeverityUtils.getSeverity(b.getSeverity()) - SeverityUtils.getSeverity(a.getSeverity()));
        return await this.createCsvFileFromRows(vulnRows);
    }
}
