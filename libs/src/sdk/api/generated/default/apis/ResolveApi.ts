/* tslint:disable */
// @ts-nocheck
/* eslint-disable */
/**
 * API
 * Audius V1 API
 *
 * The version of the OpenAPI document: 1.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


import * as runtime from '../runtime';

export interface ResolveRequest {
    url: string;
}

/**
 * 
 */
export class ResolveApi extends runtime.BaseAPI {

    /**
     * This endpoint allows you to lookup and access API resources when you only know the audius.co URL. Tracks, Playlists, and Users are supported.
     * Resolves and redirects a provided Audius app URL to the API resource URL it represents
     */
    async resolveRaw(requestParameters: ResolveRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<void>> {
        if (requestParameters.url === null || requestParameters.url === undefined) {
            throw new runtime.RequiredError('url','Required parameter requestParameters.url was null or undefined when calling resolve.');
        }

        const queryParameters: any = {};

        if (requestParameters.url !== undefined) {
            queryParameters['url'] = requestParameters.url;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        const response = await this.request({
            path: `/resolve`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.VoidApiResponse(response);
    }

    /**
     * This endpoint allows you to lookup and access API resources when you only know the audius.co URL. Tracks, Playlists, and Users are supported.
     * Resolves and redirects a provided Audius app URL to the API resource URL it represents
     */
    async resolve(requestParameters: ResolveRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<void> {
        await this.resolveRaw(requestParameters, initOverrides);
    }

}
