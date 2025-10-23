/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateChatMessageDto = {
    role: CreateChatMessageDto.role;
    /**
     * Content of the chat message
     */
    content: string;
    /**
     * Identifier of the originating tool call
     */
    toolCallId?: string;
    /**
     * Originating tool name
     */
    name?: string;
};
export namespace CreateChatMessageDto {
    export enum role {
        USER = 'user',
        ASSISTANT = 'assistant',
        SYSTEM = 'system',
        DEVELOPER = 'developer',
        TOOL = 'tool',
    }
}

