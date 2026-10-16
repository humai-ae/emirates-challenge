import {
  type AssignFlagRequest,
  AssignFlagRequestSchema,
  type ConfirmFlagRequest,
  ConfirmFlagRequestSchema,
  type DismissFlagRequest,
  DismissFlagRequestSchema,
  type FixChecksResponse,
  type FixFlagRequest,
  FixFlagRequestSchema,
  type FlagResponse,
  type InboxQuery,
  InboxQuerySchema,
  type InboxResponse,
  type QueueResponse,
  type SendBackFlagRequest,
  SendBackFlagRequestSchema,
  type User,
  type VerifyFlagRequest,
  VerifyFlagRequestSchema,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { FlagsService } from "./flags.service.js";

export const FlagIdPipe = new ZodValidationPipe(z.string().regex(/^F-\d{6,}$/));

@Controller("flags")
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get("inbox")
  @Roles("analyst")
  inbox(@Query(new ZodValidationPipe(InboxQuerySchema)) query: InboxQuery): Promise<InboxResponse> {
    return this.flags.inbox(query);
  }

  @Get("fix-checks")
  @Roles("analyst")
  fixChecks(): Promise<FixChecksResponse> {
    return this.flags.fixChecks();
  }

  @Get("queue")
  @Roles("lead")
  queue(@CurrentUser() user: User): Promise<QueueResponse> {
    return this.flags.queue(user);
  }

  @Get(":id")
  @Roles("admin", "analyst", "lead", "auditor")
  detail(@CurrentUser() user: User, @Param("id", FlagIdPipe) id: string): Promise<FlagResponse> {
    return this.flags.detail(user, id);
  }

  @Post(":id/confirm")
  @Roles("analyst")
  @HttpCode(200)
  confirm(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(ConfirmFlagRequestSchema)) body: ConfirmFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.confirm(user, id, body);
  }

  @Post(":id/dismiss")
  @Roles("analyst")
  @HttpCode(200)
  dismiss(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(DismissFlagRequestSchema)) body: DismissFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.dismiss(user, id, body);
  }

  @Post(":id/assign")
  @Roles("lead")
  @HttpCode(200)
  assign(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(AssignFlagRequestSchema)) body: AssignFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.assign(user, id, body);
  }

  @Post(":id/fix")
  @Roles("lead")
  @HttpCode(200)
  fix(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(FixFlagRequestSchema)) body: FixFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.fix(user, id, body);
  }

  @Post(":id/verify")
  @Roles("analyst")
  @HttpCode(200)
  verify(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(VerifyFlagRequestSchema)) body: VerifyFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.verify(user, id, body);
  }

  @Post(":id/send-back")
  @Roles("analyst")
  @HttpCode(200)
  sendBack(
    @CurrentUser() user: User,
    @Param("id", FlagIdPipe) id: string,
    @Body(new ZodValidationPipe(SendBackFlagRequestSchema)) body: SendBackFlagRequest,
  ): Promise<FlagResponse> {
    return this.flags.sendBack(user, id, body);
  }
}
