import {
  type AiSecondOpinionRequest,
  AiSecondOpinionRequestSchema,
  type AiSecondOpinionResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SecondOpinionsService } from "./second-opinions.service.js";

@Controller("v1/second-opinion")
export class SecondOpinionsController {
  constructor(private readonly opinions: SecondOpinionsService) {}

  /** Jev's view of each transaction against its rules: never a finding, only a second opinion. */
  @Post("evaluate")
  @HttpCode(200)
  evaluate(
    @Body(new ZodValidationPipe(AiSecondOpinionRequestSchema)) body: AiSecondOpinionRequest,
  ): Promise<AiSecondOpinionResponse> {
    return this.opinions.evaluate(body);
  }
}
