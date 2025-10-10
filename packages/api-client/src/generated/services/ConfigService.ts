/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
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
}
