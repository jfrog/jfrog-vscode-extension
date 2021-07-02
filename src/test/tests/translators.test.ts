import { assert, expect } from 'chai';
import { ICve, IIssue, IVulnerableComponent } from 'jfrog-client-js';
import { Issue } from '../../main/types/issue';
import { Translators } from '../../main/utils/translators';

/**
 * Test functionality of @class Translators.
 */
describe('Translators Tests', () => {
    it('Fixed versions - No issues', async () => {
        let issue: Issue = Translators.toIssue({} as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Empty', async () => {
        let component: IVulnerableComponent = { component_id: '', fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Many empty fixed versions', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: [] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Some empty fixed versions', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: ['1'] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 1);
        expect(issue.fixedVersions).to.have.members(['1']);
    });

    it('Fixed versions - Distinction', async () => {
        let component1: IVulnerableComponent = { component_id: 'comp1', fixed_versions: ['1', '2'] };
        let component2: IVulnerableComponent = { component_id: 'comp2', fixed_versions: ['2', '1'] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 2);
        expect(issue.fixedVersions).to.have.members(['1', '2']);
    });

    it('CVEs - No CVEs', async () => {
        let clientCves: ICve[] = [];
        let issues: Issue = Translators.toIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        assert.lengthOf(issues.cves || [], 0);
    });

    it('CVEs - Empty CVEs', async () => {
        let clientCves: ICve[] = [{ cve: '', cvss_v2: '4.3/CVSS:2.0/AV:N/AC:M/Au:N/C:N/I:P/A:N' }];
        let issues: Issue = Translators.toIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        assert.lengthOf(issues.cves || [], 0);
    });

    it('CVEs - One CVE', async () => {
        let clientCves: ICve[] = [{ cve: 'CVE-2020-1', cvss_v2: '4.3/CVSS:2.0/AV:N/AC:M/Au:N/C:N/I:P/A:N' }];
        let issues: Issue = Translators.toIssue({ cves: clientCves } as IIssue);
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
        let issues: Issue = Translators.toIssue({ cves: clientCves } as IIssue);
        assert.isDefined(issues.cves);
        if (!issues.cves) {
            return;
        }
        assert.lengthOf(issues.cves, 2);
        expect(issues.cves).to.have.members(['CVE-2020-1', 'CVE-2020-2']);
        expect(issues.cves.toString()).to.be.oneOf(['CVE-2020-1,CVE-2020-2', 'CVE-2020-2,CVE-2020-1']);
    });
});
