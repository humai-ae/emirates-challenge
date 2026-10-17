import {
  type AiExplainRequest,
  AiExplainRequestSchema,
  type AiExplainResponse,
  type AiRuleActionRequest,
  AiRuleActionRequestSchema,
  type AiRuleActionResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExplainService } from "./explain.service.js";
import { RuleActionService } from "./rule-action.service.js";

@Controller("v1/texts")
export class TextsController {
  constructor(
    private readonly actions: RuleActionService,
    private readonly explanations: ExplainService,
  ) {}

  @Post("rule-action")
  @HttpCode(200)
  ruleAction(
    @Body(new ZodValidationPipe(AiRuleActionRequestSchema)) body: AiRuleActionRequest,
  ): Promise<AiRuleActionResponse> {
    return this.actions.write(body);
  }

  @Post("explain")
  @HttpCode(200)
  explain(
    @Body(new ZodValidationPipe(AiExplainRequestSchema)) body: AiExplainRequest,
  ): Promise<AiExplainResponse> {
    return this.explanations.explain(body);
  }
}
