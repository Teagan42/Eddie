import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ConfigEditorService } from "./config-editor.service";
import { ConfigSchemaDto } from "./dto/config-schema.dto";
import { ConfigSourceDto } from "./dto/config-source.dto";
import { ConfigPreviewDto } from "./dto/config-preview.dto";
import { ConfigSourcePayloadDto } from "./dto/config-source-payload.dto";

@ApiTags("config")
@Controller("config")
export class ConfigEditorController {
  constructor(private readonly editor: ConfigEditorService) {}

  @ApiOperation({ summary: "Get Eddie configuration schema." })
  @ApiOkResponse({ type: ConfigSchemaDto })
  @Get("schema")
  getSchema(): ConfigSchemaDto {
    const bundle = this.editor.getSchemaBundle();
    return {
      id: bundle.id,
      version: bundle.version,
      schema: bundle.schema,
      inputSchema: bundle.inputSchema,
    };
  }

  @ApiOperation({ summary: "Get the current Eddie configuration source." })
  @ApiOkResponse({ type: ConfigSourceDto })
  @Get("editor")
  async getSource(): Promise<ConfigSourceDto> {
    const snapshot = await this.editor.getSnapshot();
    return {
      path: snapshot.path,
      format: snapshot.format,
      content: snapshot.content,
      input: snapshot.input,
      config: snapshot.config,
      error: snapshot.error,
    };
  }

  @ApiOperation({ summary: "Preview an Eddie configuration payload." })
  @ApiOkResponse({ type: ConfigPreviewDto })
  @ApiBody({ type: ConfigSourcePayloadDto })
  @Post("editor/preview")
  async preview(
    @Body() payload: ConfigSourcePayloadDto
  ): Promise<ConfigPreviewDto> {
    const result = await this.editor.preview(payload.content, payload.format);
    return {
      input: result.input,
      config: result.config,
    };
  }

  @ApiOperation({ summary: "Persist an Eddie configuration payload." })
  @ApiOkResponse({ type: ConfigSourceDto })
  @ApiBody({ type: ConfigSourcePayloadDto })
  @Put("editor")
  async save(@Body() payload: ConfigSourcePayloadDto): Promise<ConfigSourceDto> {
    const snapshot = await this.editor.save(
      payload.content,
      payload.format,
      payload.path
    );
    return {
      path: snapshot.path,
      format: snapshot.format,
      content: snapshot.content,
      input: snapshot.input,
      config: snapshot.config,
      error: snapshot.error,
    };
  }
}
