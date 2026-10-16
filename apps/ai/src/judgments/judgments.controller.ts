import { type AiJudgeRequest, AiJudgeRequestSchema, type AiJudgeResponse } from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JudgmentsService } from "./judgments.service.js";

@Controller("v1/judgments")
export class JudgmentsController {
  constructor(private readonly judgments: JudgmentsService) {}

  @Post("evaluate")
  @HttpCode(200)
  evaluate(
    @Body(new ZodValidationPipe(AiJudgeRequestSchema)) body: AiJudgeRequest,
  ): Promise<AiJudgeResponse> {
    return this.judgments.evaluate(body);
  }
}
