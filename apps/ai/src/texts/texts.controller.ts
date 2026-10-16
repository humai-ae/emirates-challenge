import {
  type AiRuleActionRequest,
  AiRuleActionRequestSchema,
  type AiRuleActionResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RuleActionService } from "./rule-action.service.js";

@Controller("v1/texts")
export class TextsController {
  constructor(private readonly actions: RuleActionService) {}

  @Post("rule-action")
  @HttpCode(200)
  ruleAction(
    @Body(new ZodValidationPipe(AiRuleActionRequestSchema)) body: AiRuleActionRequest,
  ): Promise<AiRuleActionResponse> {
    return this.actions.write(body);
  }
}
