import {
  type ConfirmMappingRequest,
  ConfirmMappingRequestSchema,
  type FindingFormatResponse,
  MAX_FORMAT_BYTES,
  type User,
} from "@hrcc/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { FindingFormatsService, type UploadedFormat } from "./finding-formats.service.js";

const FormatIdPipe = new ZodValidationPipe(z.uuid().transform((value) => value.toLowerCase()));

@Controller("finding-formats")
export class FindingFormatsController {
  constructor(private readonly formats: FindingFormatsService) {}

  /** Guards run before the interceptor, so only an admin's upload is ever read. */
  @Post()
  @Roles("admin")
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor("format", {
      defParamCharset: "utf8",
      limits: { fileSize: MAX_FORMAT_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentUser() admin: User,
    @UploadedFile() file: UploadedFormat | undefined,
  ): Promise<FindingFormatResponse> {
    return this.formats.upload(admin, file);
  }

  @Get("current")
  @Roles("admin", "analyst")
  current(): Promise<FindingFormatResponse> {
    return this.formats.current();
  }

  @Patch(":id/mapping")
  @Roles("admin")
  confirm(
    @CurrentUser() admin: User,
    @Param("id", FormatIdPipe) id: string,
    @Body(new ZodValidationPipe(ConfirmMappingRequestSchema)) body: ConfirmMappingRequest,
  ): Promise<FindingFormatResponse> {
    return this.formats.confirm(admin, id, body);
  }
}
