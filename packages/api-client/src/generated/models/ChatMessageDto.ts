/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ChatMessageDto = {
    /**
     * Unique identifier
     */
    id: string;
    /**
     * Owning session id
     */
    sessionId: string;
    /**
     * Message role
     */
    role: ChatMessageDto.role;
    /**
     * Message content
     */
    content: string;
    /**
     * Creation timestamp (ISO string)
     */
    createdAt: string;
    /**
     * Identifier of the originating tool call
     */
    toolCallId?: string;
    /**
     * Originating tool name
     */
    name?: string;
};
export namespace ChatMessageDto {
    /**
     * Message role
     */
    export enum role {
        USER = 'user',
        ASSISTANT = 'assistant',
        SYSTEM = 'system',
        TOOL = 'tool',
    }
}

