import {
  type AiRoutingRequest,
  AiRoutingRequestSchema,
  type AiRoutingResponse,
} from "@hrcc/shared";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RoutingService } from "./routing.service.js";

@Controller("v1/routing")
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post("propose")
  @HttpCode(200)
  propose(
    @Body(new ZodValidationPipe(AiRoutingRequestSchema)) body: AiRoutingRequest,
  ): Promise<AiRoutingResponse> {
    return this.routing.propose(body);
  }
}
