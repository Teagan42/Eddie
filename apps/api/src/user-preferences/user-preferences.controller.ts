import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  LayoutPreferencesDto,
  UpdateLayoutPreferencesDto,
} from "./dto/layout-preferences.dto";
import { UserPreferencesService } from "./user-preferences.service";

interface RequestWithApiKey extends Request {
  apiKey?: string;
}

@ApiTags("user-preferences")
@Controller("user/preferences")
export class UserPreferencesController {
  constructor(private readonly service: UserPreferencesService) {}

  @Get("layout")
  getLayout(@Req() request: RequestWithApiKey): LayoutPreferencesDto {
    const userId = this.resolveUserId(request);
    return this.service.getPreferences(userId);
  }

  @Put("layout")
  updateLayout(
    @Req() request: RequestWithApiKey,
    @Body() dto: UpdateLayoutPreferencesDto
  ): LayoutPreferencesDto {
    const userId = this.resolveUserId(request);
    return this.service.updatePreferences(userId, dto);
  }

  private resolveUserId(request: RequestWithApiKey): string {
    return request.apiKey ?? "anonymous";
  }
}
