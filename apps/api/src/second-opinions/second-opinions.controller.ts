import {
  type SecondOpinionResponse,
  type SecondOpinionsQuery,
  SecondOpinionsQuerySchema,
  type SecondOpinionsResponse,
  type User,
} from "@hrcc/shared";
import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SecondOpinionsService } from "./second-opinions.service.js";

const OpinionIdPipe = new ZodValidationPipe(z.uuid());

@Controller("second-opinions")
export class SecondOpinionsController {
  constructor(private readonly opinions: SecondOpinionsService) {}

  @Get()
  @Roles("analyst", "admin", "auditor")
  list(
    @Query(new ZodValidationPipe(SecondOpinionsQuerySchema)) query: SecondOpinionsQuery,
  ): Promise<SecondOpinionsResponse> {
    return this.opinions.list(query.runId);
  }

  @Get(":id")
  @Roles("analyst", "admin", "auditor")
  detail(@Param("id", OpinionIdPipe) id: string): Promise<SecondOpinionResponse> {
    return this.opinions.detail(id);
  }

  @Post(":id/noted")
  @Roles("analyst")
  @HttpCode(200)
  noted(
    @CurrentUser() user: User,
    @Param("id", OpinionIdPipe) id: string,
  ): Promise<SecondOpinionResponse> {
    return this.opinions.noted(user, id);
  }

  @Post(":id/review")
  @Roles("analyst")
  @HttpCode(200)
  review(
    @CurrentUser() user: User,
    @Param("id", OpinionIdPipe) id: string,
  ): Promise<SecondOpinionResponse> {
    return this.opinions.review(user, id);
  }
}
