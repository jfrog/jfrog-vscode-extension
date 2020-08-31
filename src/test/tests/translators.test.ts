import { assert, expect } from 'chai';
import { IIssue, IVulnerableComponent } from 'xray-client-js';
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
        let component: IVulnerableComponent = { fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Many empty fixed versions', async () => {
        let component1: IVulnerableComponent = { fixed_versions: [] };
        let component2: IVulnerableComponent = { fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.isEmpty(issue.fixedVersions);
    });

    it('Fixed versions - Some empty fixed versions', async () => {
        let component1: IVulnerableComponent = { fixed_versions: ['1'] };
        let component2: IVulnerableComponent = { fixed_versions: [] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 1);
        expect(issue.fixedVersions).to.have.members(['1']);
    });

    it('Fixed versions - Distinction', async () => {
        let component1: IVulnerableComponent = { fixed_versions: ['1', '2'] };
        let component2: IVulnerableComponent = { fixed_versions: ['2', '1'] };
        let issue: Issue = Translators.toIssue({ components: [component1, component2] } as IIssue);
        assert.lengthOf(issue.fixedVersions, 2);
        expect(issue.fixedVersions).to.have.members(['1', '2']);
    });
});
