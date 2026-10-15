import {
  type CreateRuleRequest,
  CreateRuleRequestSchema,
  MAX_POLICY_BYTES,
  type PolicyUploadResponse,
  RuleIdSchema,
  type RuleResponse,
  type RulesListResponse,
  type User,
} from "@hrcc/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RulesService, type UploadedPolicy } from "./rules.service.js";

export const RuleIdPipe = new ZodValidationPipe(RuleIdSchema);

@Controller()
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /** Guards run before the interceptor, so only an admin's upload is ever read. */
  @Post("policies")
  @Roles("admin")
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor("policy", {
      // Browsers send file names as UTF-8; multer reads them as Latin-1 unless told.
      defParamCharset: "utf8",
      limits: { fileSize: MAX_POLICY_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadPolicy(
    @CurrentUser() admin: User,
    @UploadedFile() file: UploadedPolicy | undefined,
  ): Promise<PolicyUploadResponse> {
    return this.rules.uploadPolicy(admin, file);
  }

  @Post("rules")
  @Roles("admin")
  @HttpCode(201)
  create(
    @CurrentUser() admin: User,
    @Body(new ZodValidationPipe(CreateRuleRequestSchema)) body: CreateRuleRequest,
  ): Promise<RuleResponse> {
    return this.rules.create(admin, body);
  }

  @Get("rules")
  @Roles("admin", "analyst", "auditor")
  list(): Promise<RulesListResponse> {
    return this.rules.list();
  }

  @Get("rules/:id")
  @Roles("admin", "analyst", "auditor")
  detail(@Param("id", RuleIdPipe) id: string): Promise<RuleResponse> {
    return this.rules.detail(id);
  }
}
