import type { NoticesResponse, User } from "@hrcc/shared";
import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { NoticesService } from "./notices.service.js";

const NoticeIdPipe = new ZodValidationPipe(z.uuid().transform((value) => value.toLowerCase()));

/** Everyone reads their own notices. */
@Controller("notices")
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<NoticesResponse> {
    return this.notices.list(user);
  }

  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentUser() user: User): Promise<NoticesResponse> {
    return this.notices.readAll(user);
  }

  @Post(":id/read")
  @HttpCode(200)
  read(@CurrentUser() user: User, @Param("id", NoticeIdPipe) id: string): Promise<NoticesResponse> {
    return this.notices.read(user, id);
  }
}
