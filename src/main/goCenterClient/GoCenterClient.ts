import { AxiosRequestConfig } from 'axios';
import { HttpClient, ISummaryRequestModel, IClientConfig } from 'xray-client-js';
import { IHttpConfig } from 'xray-client-js/dist/src/HttpClient';
import { IModuleResponse } from './model/ModuleResponse';

export class GoCenterClient {
    private readonly goCenterUrl: string = 'https://search.gocenter.io';
    private readonly getMetadataForModulesEndpoint: string = '/api/ui/getMetadataForModules';
    private readonly httpClient: HttpClient;

    public constructor(config: IClientConfig) {
        const { proxy, headers } = config;
        this.httpClient = new HttpClient({ serverUrl: this.goCenterUrl, proxy, headers } as IHttpConfig);
    }

    public async getMetadataForModules(model: ISummaryRequestModel): Promise<IModuleResponse> {
        const httpOptions: AxiosRequestConfig = {
            url: this.getMetadataForModulesEndpoint,
            method: 'post',
            data: model
        };
        return await this.httpClient.doRequest(httpOptions);
    }
}
