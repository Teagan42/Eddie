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
};
export namespace CreateChatMessageDto {
    export enum role {
        USER = 'user',
        ASSISTANT = 'assistant',
        SYSTEM = 'system',
    }
}

