/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProviderCatalogEntryDto } from '../models/ProviderCatalogEntryDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProvidersService {
    /**
     * List supported providers and available models.
     * @returns ProviderCatalogEntryDto
     * @throws ApiError
     */
    public static providersControllerListCatalog(): CancelablePromise<Array<ProviderCatalogEntryDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/providers/catalog',
        });
    }
}
