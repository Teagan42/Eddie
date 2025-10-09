import { Type } from "class-transformer";
import {
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateChatMessageDto } from "./create-chat-message.dto";

export class SendChatMessagePayloadDto {
  @IsUUID()
  sessionId!: string;

  @ValidateNested()
  @Type(() => CreateChatMessageDto)
  message!: CreateChatMessageDto;
}
