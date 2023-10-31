import { Configuration } from '../../main/utils/configuration';
import { SinonStub } from 'sinon';
import * as vscode from 'vscode';
import sinon from 'sinon';
import { assert } from 'chai';

describe('External Resources Repository', async () => {
    let getConfigurationStub: SinonStub<any>;

    afterEach(() => {
        getConfigurationStub.restore();
    });

    it('Should return externalResourcesRepository from vscode workspace configuration', () => {
        const mockConfig: any = {
            get: sinon.stub().returns('mockedExternalRepo')
        };

        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);
        const result: string = Configuration.getExternalResourcesRepository();
        assert.equal(result, 'mockedExternalRepo');
    });

    it('Should return externalResourcesRepository from environment variable if vscode workspace configuration is empty', () => {
        const mockConfig: any = {
            get: sinon.stub().returns(undefined)
        };

        process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV] = 'mockedEnvVariable';

        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);
        const result: string = Configuration.getExternalResourcesRepository();
        assert.equal(result, 'mockedEnvVariable');
        delete process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV];
    });

    it('Should return empty string if both vscode workspace configuration and environment variable are empty', () => {
        const mockConfig: any = {
            get: sinon.stub().returns(undefined)
        };

        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);
        const result: string = Configuration.getExternalResourcesRepository();
        assert.isEmpty(result);
    });
});
