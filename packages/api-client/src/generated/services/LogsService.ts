/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
import type { LogEntryDto } from '../models/LogEntryDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LogsService {
    /**
     * List log entries
     * @returns LogEntryDto
     * @throws ApiError
     */
    public static logsControllerList({
        offset = 0,
        limit = 50,
    }: {
        offset?: number;
        limit?: number;
    } = {}): CancelablePromise<Array<LogEntryDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logs',
            query: {
                offset,
                limit,
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
