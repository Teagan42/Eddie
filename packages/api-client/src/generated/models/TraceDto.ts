/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TraceDto = {
    /**
     * Trace identifier
     */
    id: string;
    /**
     * Related chat session id
     */
    sessionId?: string;
    /**
     * Trace name
     */
    name: string;
    /**
     * Trace status
     */
    status: TraceDto.status;
    /**
     * Duration in milliseconds
     */
    durationMs?: number;
    /**
     * Creation timestamp
     */
    createdAt: string;
    /**
     * Last update timestamp
     */
    updatedAt: string;
    /**
     * Structured metadata
     */
    metadata?: Record<string, any>;
};
export namespace TraceDto {
    /**
     * Trace status
     */
    export enum status {
        PENDING = 'pending',
        RUNNING = 'running',
        COMPLETED = 'completed',
        FAILED = 'failed',
    }
}

