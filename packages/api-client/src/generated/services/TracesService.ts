/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TraceDto } from '../models/TraceDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TracesService {
    /**
     * List traces
     * @returns TraceDto
     * @throws ApiError
     */
    public static tracesControllerList(): CancelablePromise<Array<TraceDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/traces',
        });
    }
    /**
     * Get a trace
     * @param id
     * @returns TraceDto
     * @throws ApiError
     */
    public static tracesControllerGet(
        id: string,
    ): CancelablePromise<TraceDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/traces/{id}',
            path: {
                'id': id,
            },
        });
    }
}
