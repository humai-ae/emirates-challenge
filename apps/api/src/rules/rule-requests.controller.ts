import {
  type CreateRuleRequest,
  CreateRuleRequestSchema,
  type RuleRequestResponse,
  type RuleRequestsResponse,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RulesService } from "./rules.service.js";

/** Rules analysts (and admins) ask for; an admin reviews each like any draft. */
@Controller("rule-requests")
@Roles("admin", "analyst")
export class RuleRequestsController {
  constructor(private readonly rules: RulesService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateRuleRequestSchema)) body: CreateRuleRequest,
  ): Promise<RuleRequestResponse> {
    return this.rules.request(user, body);
  }

  @Get()
  list(@CurrentUser() user: User): Promise<RuleRequestsResponse> {
    return this.rules.requests(user);
  }
}
