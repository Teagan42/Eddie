/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
import type { ChatMessageDto } from '../models/ChatMessageDto';
import type { ChatSessionDto } from '../models/ChatSessionDto';
import type { CreateChatMessageDto } from '../models/CreateChatMessageDto';
import type { CreateChatSessionDto } from '../models/CreateChatSessionDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChatSessionsService {
    /**
     * List chat sessions
     * @returns ChatSessionDto
     * @throws ApiError
     */
    public static chatSessionsControllerList(): CancelablePromise<Array<ChatSessionDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat-sessions',
        });
    }
    /**
     * Create a new chat session
     * @param requestBody
     * @returns ChatSessionDto
     * @throws ApiError
     */
    public static chatSessionsControllerCreate(
        requestBody: CreateChatSessionDto,
    ): CancelablePromise<ChatSessionDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat-sessions',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Fetch a single chat session
     * @param id
     * @returns ChatSessionDto
     * @throws ApiError
     */
    public static chatSessionsControllerGet(
        id: string,
    ): CancelablePromise<ChatSessionDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat-sessions/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Archive a chat session
     * @param id
     * @returns ChatSessionDto
     * @throws ApiError
     */
    public static chatSessionsControllerArchive(
        id: string,
    ): CancelablePromise<ChatSessionDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/chat-sessions/{id}/archive',
            path: {
                'id': id,
            },
        });
    }
    /**
     * List session messages
     * @param id
     * @returns ChatMessageDto
     * @throws ApiError
     */
    public static chatSessionsControllerListMessages(
        id: string,
    ): CancelablePromise<Array<ChatMessageDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat-sessions/{id}/messages',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Append a message to the session
     * @param id
     * @param requestBody
     * @returns ChatMessageDto
     * @throws ApiError
     */
    public static chatSessionsControllerCreateMessage(
        id: string,
        requestBody: CreateChatMessageDto,
    ): CancelablePromise<ChatMessageDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat-sessions/{id}/messages',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
