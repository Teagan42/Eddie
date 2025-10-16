/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ChatSessionDto = {
    /**
     * Unique identifier
     */
    id: string;
    /**
     * Human friendly title
     */
    title: string;
    /**
     * Optional description
     */
    description?: string;
    /**
     * Session status
     */
    status: ChatSessionDto.status;
    /**
     * Creation timestamp (ISO string)
     */
    createdAt: string;
    /**
     * Last update timestamp (ISO string)
     */
    updatedAt: string;
};
export namespace ChatSessionDto {
    /**
     * Session status
     */
    export enum status {
        ACTIVE = 'active',
        ARCHIVED = 'archived',
    }
}

