import {
  type RoutingProposal,
  type RoutingResponse,
  type SaveRoutingRequest,
  SaveRoutingRequestSchema,
  type User,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RoutingService } from "./routing.service.js";

@Controller("routing")
@Roles("admin")
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get()
  get(): Promise<RoutingResponse> {
    return this.routing.get();
  }

  @Post("proposal")
  @HttpCode(200)
  propose(): Promise<RoutingProposal> {
    return this.routing.propose();
  }

  @Put()
  save(
    @CurrentUser() admin: User,
    @Body(new ZodValidationPipe(SaveRoutingRequestSchema)) body: SaveRoutingRequest,
  ): Promise<RoutingResponse> {
    return this.routing.save(admin, body);
  }
}
