/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConfigPreviewDto } from '../models/ConfigPreviewDto';
import type { ConfigSchemaDto } from '../models/ConfigSchemaDto';
import type { ConfigSourceDto } from '../models/ConfigSourceDto';
import type { ConfigSourcePayloadDto } from '../models/ConfigSourcePayloadDto';
import type { RuntimeConfigDto } from '../models/RuntimeConfigDto';
import type { UpdateRuntimeConfigDto } from '../models/UpdateRuntimeConfigDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ConfigService {
    /**
     * Get runtime configuration
     * @returns RuntimeConfigDto
     * @throws ApiError
     */
    public static runtimeConfigControllerGet(): CancelablePromise<RuntimeConfigDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/config',
        });
    }
    /**
     * Update runtime configuration
     * @param requestBody
     * @returns RuntimeConfigDto
     * @throws ApiError
     */
    public static runtimeConfigControllerUpdate(
        requestBody: UpdateRuntimeConfigDto,
    ): CancelablePromise<RuntimeConfigDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/config',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get Eddie configuration schema.
     * @returns ConfigSchemaDto
     * @throws ApiError
     */
    public static configEditorControllerGetSchema(): CancelablePromise<ConfigSchemaDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/config/schema',
        });
    }
    /**
     * Get the current Eddie configuration source.
     * @returns ConfigSourceDto
     * @throws ApiError
     */
    public static configEditorControllerGetSource(): CancelablePromise<ConfigSourceDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/config/editor',
        });
    }
    /**
     * Persist an Eddie configuration payload.
     * @param requestBody
     * @returns ConfigSourceDto
     * @throws ApiError
     */
    public static configEditorControllerSave(
        requestBody: ConfigSourcePayloadDto,
    ): CancelablePromise<ConfigSourceDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/config/editor',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Preview an Eddie configuration payload.
     * @param requestBody
     * @returns ConfigPreviewDto
     * @throws ApiError
     */
    public static configEditorControllerPreview(
        requestBody: ConfigSourcePayloadDto,
    ): CancelablePromise<ConfigPreviewDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/config/editor/preview',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
