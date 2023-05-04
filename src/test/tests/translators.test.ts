import { assert, expect } from 'chai';
import { ICve, IGraphCve, IIssue, IReference, IVulnerableComponent } from 'jfrog-client-js';
import { ICve as WebICve, IApplicableDetails } from 'jfrog-ide-webview';
import { LogLevel } from '../../main/log/logManager';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { Translators } from '../../main/utils/translators';
import { Severity } from '../../main/types/severity';
import { AnalyzerManagerSeverityLevel } from '../../main/scanLogic/scanRunners/analyzerModels';

/**
 * Test functionality of @class Translators.
 */
describe('Translators Tests', () => {
    it('toAnalyzerLogLevel', async () => {
        [
            { inputLevel: 'DEBUG', expectedLevel: 'debug' },
            { inputLevel: 'INFO', expectedLevel: 'info' },
            { inputLevel: 'WARN', expectedLevel: 'error' },
            { inputLevel: 'ERR', expectedLevel: 'error' }
        ].forEach(test => {
            assert.equal(test.expectedLevel, Translators.toAnalyzerLogLevel(<LogLevel>test.inputLevel));
        });
    });

    it('levelToSeverity', async () => {
        [
            { inputLevel: 'none', expectedLevel: Severity.Unknown },
            { inputLevel: 'note', expectedLevel: Severity.Low },
            { inputLevel: 'warning', expectedLevel: Severity.Medium },
            { inputLevel: 'error', expectedLevel: Severity.High }
        ].forEach(test => {
            assert.equal(test.expectedLevel, Translators.levelToSeverity(<AnalyzerManagerSeverityLevel>test.inputLevel));
        });
    });

    it('toWebViewICve', async () => {
        let cve: IGraphCve = {
            cve: 'cve',
            cvss_v2_score: 'score v2',
            cvss_v2_vector: 'vector v2',
            cvss_v3_score: 'score v3',
            cvss_v3_vector: 'vector v3'
        } as IGraphCve;
        let details: IApplicableDetails = {
            isApplicable: true
        };
        assertWebCve(Translators.toWebViewICve());
        assertWebCve(Translators.toWebViewICve(cve), cve);
        assertWebCve(Translators.toWebViewICve(undefined, details), undefined, details);
        assertWebCve(Translators.toWebViewICve(cve, details), cve, details);
    });

    function assertWebCve(result: WebICve | undefined, cve?: IGraphCve, details?: IApplicableDetails) {
        if (cve || details) {
            assert.isDefined(result);
            if (cve) {
                assert.equal(result?.id, cve.cve);
                assert.equal(result?.cvssV2Score, cve.cvss_v2_score);
                assert.equal(result?.cvssV2Vector, cve.cvss_v2_vector);
                assert.equal(result?.cvssV3Score, cve.cvss_v3_score);
                assert.equal(result?.cvssV3Vector, cve.cvss_v3_vector);
            }
            if (details) {
                assert.equal(result?.applicableData, details);
            }
        } else {
            assert.isUndefined(result);
        }
    }

    it('Fixed versions - No issues', async () => {
        let issue: IIssueCacheObject = Translators.toCacheIssue({} as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Empty', async () => {
        let component: IVulnerableComponent = { component_id: '', fixed_versions: [] };
        let issue: IIssueCacheObject = Translators.toCacheIssue({ components: [component] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Many empty fixed versions', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: [] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: [] };
        let issue: IIssueCacheObject = Translators.toCacheIssue({ components: [component1, component2] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Some empty fixed versions', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: ['1'] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: [] };
        let issue: IIssueCacheObject = Translators.toCacheIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 1);
        expect(issue.fixedVersions).to.have.members(['1']);
    });

    it('Fixed versions - Distinction', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: ['1', '2'] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: ['2', '1'] };
        let issue: IIssueCacheObject = Translators.toCacheIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 2);
        expect(issue.fixedVersions).to.have.members(['1', '2']);
    });

    it('CVEs - No CVEs', async () => {
        let clientCves: ICve[] = [];
        let issues: IIssueCacheObject = Translators.toCacheIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        assert.lengthOf(issues.cves || [], 0);
    });

    it('CVEs - One CVE', async () => {
        let clientCves: ICve[] = [{ cve: 'CVE-2020-1', cvss_v2: '4.3/CVSS:2.0/AV:N/AC:M/Au:N/C:N/I:P/A:N' }];
        let issues: IIssueCacheObject = Translators.toCacheIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        if (!issues.cves) {
            return;
        }
        assert.lengthOf(issues.cves, 1);
        assert.equal(issues.cves[0], 'CVE-2020-1');
    });

    it('CVEs - Two CVEs', async () => {
        let clientCves: ICve[] = [
            { cve: 'CVE-2020-1', cvss_v2: '4.3/CVSS:2.0/AV:N/AC:M/Au:N/C:N/I:P/A:N' },
            { cve: 'CVE-2020-2', cvss_v2: '4.3/CVSS:2.0/AV:N/AC:M/Au:N/C:N/I:P/A:N' }
        ];
        let issues: IIssueCacheObject = Translators.toCacheIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        if (!issues.cves) {
            return;
        }
        assert.lengthOf(issues.cves, 2);
        expect(issues.cves).to.have.members(['CVE-2020-1', 'CVE-2020-2']);
        expect(issues.cves.toString()).to.be.oneOf(['CVE-2020-1,CVE-2020-2', 'CVE-2020-2,CVE-2020-1']);
    });

    it('References - One reference', async () => {
        let cleaned: IReference[] = Translators.cleanReferencesLink(['www.a.com']);
        assert.lengthOf(cleaned, 1);
        assert.equal(cleaned[0].url, 'www.a.com');
    });

    it('References - One Markdown reference', async () => {
        let cleaned: IReference[] = Translators.cleanReferencesLink(['[a](www.a.com)']);
        assert.lengthOf(cleaned || [], 1);
        assert.equal(cleaned[0].url, 'www.a.com');
        assert.equal(cleaned[0].text, 'a');
    });

    it('References - Two references', async () => {
        let cleaned: IReference[] = Translators.cleanReferencesLink(['www.a.com', 'www.b.com']);
        assert.lengthOf(cleaned || [], 2);
        assert.equal(cleaned[0].url, 'www.a.com');
        assert.equal(cleaned[1].url, 'www.b.com');
    });

    it('References - Two combined references', async () => {
        let cleaned: IReference[] = Translators.cleanReferencesLink(['www.a.com\nwww.b.com']);
        assert.lengthOf(cleaned || [], 2);
        assert.equal(cleaned[0].url, 'www.a.com');
        assert.equal(cleaned[1].url, 'www.b.com');
    });

    it('References - Two Markdown combined references', async () => {
        let cleaned: IReference[] = Translators.cleanReferencesLink(['[a](www.a.com)\n[b](www.b.com)']);
        assert.lengthOf(cleaned || [], 2);
        assert.equal(cleaned[0].url, 'www.a.com');
        assert.equal(cleaned[0].text, 'a');
        assert.equal(cleaned[1].url, 'www.b.com');
        assert.equal(cleaned[1].text, 'b');
    });
});
