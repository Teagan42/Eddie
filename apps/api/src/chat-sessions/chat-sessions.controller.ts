import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ChatSessionsService } from "./chat-sessions.service";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import {
  ChatMessageDto,
  ChatSessionDto,
} from "./dto/chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { UpdateChatSessionDto } from "./dto/update-chat-session.dto";

@ApiTags("chat-sessions")
@Controller("chat-sessions")
export class ChatSessionsController {
  constructor(private readonly chatSessions: ChatSessionsService) {}

  @ApiOperation({ summary: "List chat sessions" })
  @ApiOkResponse({ type: ChatSessionDto, isArray: true })
  @Get()
  async list(): Promise<ChatSessionDto[]> {
    return this.chatSessions.listSessions();
  }

  @ApiOperation({ summary: "Create a new chat session" })
  @ApiCreatedResponse({ type: ChatSessionDto })
  @Post()
  async create(@Body() dto: CreateChatSessionDto): Promise<ChatSessionDto> {
    return this.chatSessions.createSession(dto);
  }

  @ApiOperation({ summary: "Fetch a single chat session" })
  @ApiOkResponse({ type: ChatSessionDto })
  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string): Promise<ChatSessionDto> {
    return this.chatSessions.getSession(id);
  }

  @ApiOperation({ summary: "Rename a chat session" })
  @ApiOkResponse({ type: ChatSessionDto })
  @Patch(":id")
  async rename(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateChatSessionDto
  ): Promise<ChatSessionDto> {
    return this.chatSessions.renameSession(id, dto);
  }

  @ApiOperation({ summary: "Archive a chat session" })
  @ApiOkResponse({ type: ChatSessionDto })
  @Patch(":id/archive")
  async archive(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ChatSessionDto> {
    return this.chatSessions.archiveSession(id);
  }

  @ApiOperation({ summary: "Delete a chat session" })
  @HttpCode(204)
  @Delete(":id")
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.chatSessions.deleteSession(id);
  }

  @ApiOperation({ summary: "List session messages" })
  @ApiOkResponse({ type: ChatMessageDto, isArray: true })
  @Get(":id/messages")
  async listMessages(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ChatMessageDto[]> {
    return this.chatSessions.listMessages(id);
  }

  @ApiOperation({ summary: "Append a message to the session" })
  @ApiCreatedResponse({ type: ChatMessageDto })
  @Post(":id/messages")
  async createMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateChatMessageDto
  ): Promise<ChatMessageDto> {
    const { message } = await this.chatSessions.addMessage(id, dto);
    return message;
  }
}
