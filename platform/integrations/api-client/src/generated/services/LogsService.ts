/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LogEntryDto } from '../models/LogEntryDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LogsService {
    /**
     * List log entries
     * @param offset
     * @param limit
     * @returns LogEntryDto
     * @throws ApiError
     */
    public static logsControllerList(
        offset: number,
        limit: number,
    ): CancelablePromise<Array<LogEntryDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logs',
            query: {
                'offset': offset,
                'limit': limit,
            },
        });
    }
    /**
     * Append a diagnostic log
     * @returns LogEntryDto
     * @throws ApiError
     */
    public static logsControllerEmit(): CancelablePromise<LogEntryDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logs',
        });
    }
}
