import {
  type AiJudgeRequest,
  AiJudgeRequestSchema,
  type AiJudgeResponse,
  type AiRestateRequest,
  AiRestateRequestSchema,
  type AiRestateResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JudgmentsService } from "./judgments.service.js";
import { RestateService } from "./restate.service.js";

@Controller("v1/judgments")
export class JudgmentsController {
  constructor(
    private readonly judgments: JudgmentsService,
    private readonly restatements: RestateService,
  ) {}

  @Post("evaluate")
  @HttpCode(200)
  evaluate(
    @Body(new ZodValidationPipe(AiJudgeRequestSchema)) body: AiJudgeRequest,
  ): Promise<AiJudgeResponse> {
    return this.judgments.evaluate(body);
  }

  /** One restatement per text, for a second Jev answer: never a loop. */
  @Post("restate")
  @HttpCode(200)
  restate(
    @Body(new ZodValidationPipe(AiRestateRequestSchema)) body: AiRestateRequest,
  ): Promise<AiRestateResponse> {
    return this.restatements.restate(body);
  }
}
