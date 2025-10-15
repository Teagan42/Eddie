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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import {
  ChatMessageDto,
  ChatSessionDto,
} from "./dto/chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { UpdateChatSessionDto } from "./dto/update-chat-session.dto";
import { CreateChatSessionCommand } from "./commands/create-chat-session.command";
import { UpdateChatSessionCommand } from "./commands/update-chat-session.command";
import { DeleteChatSessionCommand } from "./commands/delete-chat-session.command";
import { SendChatMessageCommand } from "./commands/send-chat-message.command";
import { ArchiveChatSessionCommand } from "./commands/archive-chat-session.command";
import { GetChatSessionQuery } from "./queries/get-chat-session.query";
import { GetChatMessagesQuery } from "./queries/get-chat-messages.query";
import { ListChatSessionsQuery } from "./queries/list-chat-sessions.query";

@ApiTags("chat-sessions")
@Controller("chat-sessions")
export class ChatSessionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @ApiOperation({ summary: "List chat sessions" })
  @ApiOkResponse({ type: ChatSessionDto, isArray: true })
  @Get()
  async list(): Promise<ChatSessionDto[]> {
    return this.queryBus.execute(new ListChatSessionsQuery());
  }

  @ApiOperation({ summary: "Create a new chat session" })
  @ApiCreatedResponse({ type: ChatSessionDto })
  @Post()
  async create(@Body() dto: CreateChatSessionDto): Promise<ChatSessionDto> {
    return this.commandBus.execute(new CreateChatSessionCommand(dto));
  }

  @ApiOperation({ summary: "Fetch a single chat session" })
  @ApiOkResponse({ type: ChatSessionDto })
  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string): Promise<ChatSessionDto> {
    return this.queryBus.execute(new GetChatSessionQuery(id));
  }

  @ApiOperation({
    summary: "Rename a chat session",
    operationId: "chatSessionsControllerRename",
  })
  @ApiOkResponse({ type: ChatSessionDto })
  @Patch(":id")
  async rename(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateChatSessionDto
  ): Promise<ChatSessionDto> {
    return this.commandBus.execute(new UpdateChatSessionCommand(id, dto));
  }

  @ApiOperation({ summary: "Archive a chat session" })
  @ApiOkResponse({ type: ChatSessionDto })
  @Patch(":id/archive")
  async archive(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ChatSessionDto> {
    return this.commandBus.execute(new ArchiveChatSessionCommand(id));
  }

  @ApiOperation({
    summary: "Delete a chat session",
    operationId: "chatSessionsControllerDelete",
  })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Delete(":id")
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.commandBus.execute(new DeleteChatSessionCommand(id));
  }

  @ApiOperation({ summary: "List session messages" })
  @ApiOkResponse({ type: ChatMessageDto, isArray: true })
  @Get(":id/messages")
  async listMessages(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ChatMessageDto[]> {
    return this.queryBus.execute(new GetChatMessagesQuery(id));
  }

  @ApiOperation({ summary: "Append a message to the session" })
  @ApiCreatedResponse({ type: ChatMessageDto })
  @Post(":id/messages")
  async createMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateChatMessageDto
  ): Promise<ChatMessageDto> {
    const { message } = await this.commandBus.execute(
      new SendChatMessageCommand(id, dto)
    );
    return message;
  }
}
