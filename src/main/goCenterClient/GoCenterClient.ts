import { HttpClient, IClientConfig, ISummaryRequestModel } from 'xray-client-js';
import { IHttpConfig, IRequestParams } from 'xray-client-js/dist/src/HttpClient';
import { IModuleResponse } from './model/ModuleResponse';

export class GoCenterClient {
    private readonly goCenterUrl: string = 'https://search.gocenter.io';
    private readonly getMetadataForModulesEndpoint: string = '/api/ui/v1/getMetadataForModules';
    private readonly httpClient: HttpClient;

    public constructor(config: IClientConfig) {
        const { proxy, headers } = config;
        this.httpClient = new HttpClient({ serverUrl: this.goCenterUrl, proxy, headers } as IHttpConfig);
    }

    public async getMetadataForModules(model: ISummaryRequestModel): Promise<IModuleResponse> {
        const httpOptions: IRequestParams = {
            url: this.getMetadataForModulesEndpoint,
            method: 'POST',
            data: model
        };
        return await this.httpClient.doRequest(httpOptions);
    }
}
