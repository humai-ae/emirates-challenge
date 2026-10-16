import type { CountsResponse, User } from "@hrcc/shared";
import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { NoticesService } from "../notices/notices.service.js";
import { FlagsService } from "./flags.service.js";

/** The badge numbers: refreshed by the apps after every change. */
@Controller("me")
export class CountsController {
  constructor(
    private readonly flags: FlagsService,
    private readonly notices: NoticesService,
  ) {}

  @Get("counts")
  async counts(@CurrentUser() user: User): Promise<CountsResponse> {
    return this.flags.counts(user, await this.notices.unread(user.id));
  }
}
