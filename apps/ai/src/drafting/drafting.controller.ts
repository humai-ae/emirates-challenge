import {
  type AiDraftRuleRequest,
  AiDraftRuleRequestSchema,
  type AiDraftRuleResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DraftingService } from "./drafting.service.js";

@Controller("v1/rules")
export class DraftingController {
  constructor(private readonly drafting: DraftingService) {}

  @Post("draft")
  @HttpCode(200)
  draft(
    @Body(new ZodValidationPipe(AiDraftRuleRequestSchema)) body: AiDraftRuleRequest,
  ): Promise<AiDraftRuleResponse> {
    return this.drafting.draft(body);
  }
}
