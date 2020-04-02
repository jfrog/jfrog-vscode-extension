import { GoCenterClient } from '../../main/goCenterClient/GoCenterClient';
import { IClientConfig, ISummaryRequestModel, ComponentDetails } from 'xray-client-js';
import { IModuleResponse } from '../../main/goCenterClient/model/ModuleResponse';
import { assert } from 'chai';
import { IComponentMetadata } from '../../main/goCenterClient/model/ComponentMetadata';
import { IVulnerabilities } from '../../main/goCenterClient/model/Vulnerabilities';
import { ISeverityCount } from '../../main/goCenterClient/model/SeverityCount';

describe('Go Center Tests', () => {
    const goCenterLink: string = 'https://search.gocenter.io/github.com/cloudfoundry/cf-deployment?v1.0.0';
    const testComponentId: string = 'github.com/cloudfoundry/cf-deployment:v1.0.0';
    let componentMetadata: IComponentMetadata;

    before(async () => {
        let goCenterClient: GoCenterClient = new GoCenterClient({} as IClientConfig);
        let summaryRequest: ISummaryRequestModel = {
            component_details: [new ComponentDetails(testComponentId)]
        } as ISummaryRequestModel;
        let moduleResponse: IModuleResponse = await goCenterClient.getMetadataForModules(summaryRequest);
        assert.isDefined(moduleResponse);
        let components: IComponentMetadata[] = moduleResponse.components_metadata;
        assert.lengthOf(components, 1);
        componentMetadata = components[0];
        assert.isEmpty(componentMetadata.error);
    });

    it('General information', async done => {
        assert.deepEqual(componentMetadata.component_id, testComponentId);
        assert.deepEqual(componentMetadata.description, 'The canonical open source deployment manifest for Cloud Foundry');
        done();
    });

    it('Metrics', async done => {
        assert.isAtLeast(componentMetadata.contributors, 200);
        assert.isAtLeast(componentMetadata.stars, 200);
        done();
    });

    it('Licenses', async done => {
        assert.lengthOf(componentMetadata.licenses, 1);
        assert.deepEqual(componentMetadata.licenses[0], 'Apache-2.0');
        done();
    });

    it('Links', async done => {
        assert.deepEqual(componentMetadata.gocenter_metrics_url, goCenterLink + '&tab=metrics');
        assert.deepEqual(componentMetadata.gocenter_readme_url, goCenterLink + '&tab=readme');
        done();
    });

    it('Vulnerabilities', async done => {
        let vulnerabilities: IVulnerabilities = componentMetadata.vulnerabilities;
        assert.isDefined(vulnerabilities);
        assert.deepEqual(vulnerabilities.gocenter_security_url, goCenterLink + '&tab=security');
        let severityCount: ISeverityCount = vulnerabilities.severity;
        assert.isDefined(severityCount);
        assert.equal(severityCount.High, 1);
        assert.equal(severityCount.Medium, 11);
        assert.equal(severityCount.Low, 2);
        assert.isUndefined(severityCount.Information);
        assert.isUndefined(severityCount.Pending);
        assert.isUndefined(severityCount.Unknown);
        done();
    });
});