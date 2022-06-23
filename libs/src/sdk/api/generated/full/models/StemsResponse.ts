// @ts-nocheck
/* tslint:disable */
/* eslint-disable */
/**
 * API
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: 1.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { exists, mapValues } from '../runtime';
import {
    StemFull,
    StemFullFromJSON,
    StemFullFromJSONTyped,
    StemFullToJSON,
} from './StemFull';
import {
    VersionMetadata,
    VersionMetadataFromJSON,
    VersionMetadataFromJSONTyped,
    VersionMetadataToJSON,
} from './VersionMetadata';

/**
 * 
 * @export
 * @interface StemsResponse
 */
export interface StemsResponse {
    /**
     * 
     * @type {number}
     * @memberof StemsResponse
     */
    latest_chain_block: number;
    /**
     * 
     * @type {number}
     * @memberof StemsResponse
     */
    latest_indexed_block: number;
    /**
     * 
     * @type {number}
     * @memberof StemsResponse
     */
    latest_chain_slot_plays: number;
    /**
     * 
     * @type {number}
     * @memberof StemsResponse
     */
    latest_indexed_slot_plays: number;
    /**
     * 
     * @type {string}
     * @memberof StemsResponse
     */
    signature: string;
    /**
     * 
     * @type {string}
     * @memberof StemsResponse
     */
    timestamp: string;
    /**
     * 
     * @type {VersionMetadata}
     * @memberof StemsResponse
     */
    version: VersionMetadata;
    /**
     * 
     * @type {Array<StemFull>}
     * @memberof StemsResponse
     */
    data?: Array<StemFull>;
}

export function StemsResponseFromJSON(json: any): StemsResponse {
    return StemsResponseFromJSONTyped(json, false);
}

export function StemsResponseFromJSONTyped(json: any, ignoreDiscriminator: boolean): StemsResponse {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'latest_chain_block': json['latest_chain_block'],
        'latest_indexed_block': json['latest_indexed_block'],
        'latest_chain_slot_plays': json['latest_chain_slot_plays'],
        'latest_indexed_slot_plays': json['latest_indexed_slot_plays'],
        'signature': json['signature'],
        'timestamp': json['timestamp'],
        'version': VersionMetadataFromJSON(json['version']),
        'data': !exists(json, 'data') ? undefined : ((json['data'] as Array<any>).map(StemFullFromJSON)),
    };
}

export function StemsResponseToJSON(value?: StemsResponse | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'latest_chain_block': value.latest_chain_block,
        'latest_indexed_block': value.latest_indexed_block,
        'latest_chain_slot_plays': value.latest_chain_slot_plays,
        'latest_indexed_slot_plays': value.latest_indexed_slot_plays,
        'signature': value.signature,
        'timestamp': value.timestamp,
        'version': VersionMetadataToJSON(value.version),
        'data': value.data === undefined ? undefined : ((value.data as Array<any>).map(StemFullToJSON)),
    };
}
