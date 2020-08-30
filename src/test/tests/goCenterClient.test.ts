import { assert } from 'chai';
import { ComponentDetails, ISummaryRequestModel } from 'xray-client-js';
import { GoCenterClient } from '../../main/goCenterClient/GoCenterClient';
import { IComponentMetadata } from '../../main/goCenterClient/model/ComponentMetadata';
import { IModuleResponse } from '../../main/goCenterClient/model/ModuleResponse';
import { ISeverityCount } from '../../main/goCenterClient/model/SeverityCount';
import { IVulnerabilities } from '../../main/goCenterClient/model/Vulnerabilities';
import { createGoCenterConfig } from './utils/utils.test';

describe('Go Center Tests', () => {
    const goCenterLink: string = 'https://search.gocenter.io/github.com/cloudfoundry/cf-deployment?version=v1.0.0';
    const testComponentId: string = 'github.com/cloudfoundry/cf-deployment:v1.0.0';
    let componentMetadata: IComponentMetadata;

    before(async () => {
        let goCenterClient: GoCenterClient = new GoCenterClient(createGoCenterConfig());
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

    it('Latest Version', async done => {
        assert.isNotEmpty(componentMetadata.latest_version);
        done();
    });

    it('Metrics', async done => {
        assert.isAtLeast(componentMetadata.contributors, 100);
        assert.isAtLeast(componentMetadata.stars, 100);
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
        assert.isAtLeast(severityCount.High, 1);
        assert.isAtLeast(severityCount.Medium, 15);
        assert.isAtLeast(severityCount.Low, 3);
        done();
    });
});
