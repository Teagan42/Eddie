/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HealthService {
    /**
     * @returns any Liveness state
     * @throws ApiError
     */
    public static healthControllerCheck(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }
    /**
     * @returns any Readiness state
     * @throws ApiError
     */
    public static healthControllerReadiness(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health/ready',
        });
    }
}
