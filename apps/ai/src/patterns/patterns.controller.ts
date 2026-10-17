import {
  type AiRankPatternsRequest,
  AiRankPatternsRequestSchema,
  type AiRankPatternsResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PatternsService } from "./patterns.service.js";

@Controller("v1/patterns")
export class PatternsController {
  constructor(private readonly patterns: PatternsService) {}

  /** How concerning each candidate is: Jev's ranking, which `api` mixes with code's. */
  @Post("rank")
  @HttpCode(200)
  rank(
    @Body(new ZodValidationPipe(AiRankPatternsRequestSchema)) body: AiRankPatternsRequest,
  ): Promise<AiRankPatternsResponse> {
    return this.patterns.rank(body);
  }
}
