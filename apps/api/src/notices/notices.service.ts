import type { Notice, NoticeKind, NoticesResponse, User } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, IsNull } from "typeorm";
import { ApiException } from "../common/api-exception.js";
import { NoticeEntity } from "../database/entities/index.js";

function toNotice(notice: NoticeEntity): Notice {
  return {
    id: notice.id,
    kind: notice.kind,
    params: notice.params,
    createdAt: notice.createdAt.toISOString(),
    readAt: notice.readAt ? notice.readAt.toISOString() : null,
  };
}

@Injectable()
export class NoticesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Tells each person once, inside the action's transaction; nobody is told of their own action. */
  async notify(
    manager: EntityManager,
    userIds: ReadonlyArray<string | null | undefined>,
    actorId: string,
    kind: NoticeKind,
    params: Record<string, string>,
  ): Promise<void> {
    const to = [
      ...new Set(userIds.filter((id): id is string => typeof id === "string" && id !== actorId)),
    ];
    if (to.length === 0) return;
    await manager.insert(
      NoticeEntity,
      to.map((userId) => ({ userId, kind, params })),
    );
  }

  /** The newest 50, and how many are unread. */
  async list(user: User): Promise<NoticesResponse> {
    const repository = this.dataSource.getRepository(NoticeEntity);
    const notices = await repository.find({
      where: { userId: user.id },
      order: { createdAt: "DESC", id: "DESC" },
      take: 50,
    });
    return { notices: notices.map(toNotice), unread: await this.unread(user.id) };
  }

  unread(userId: string): Promise<number> {
    return this.dataSource
      .getRepository(NoticeEntity)
      .count({ where: { userId, readAt: IsNull() } });
  }

  async read(user: User, id: string): Promise<NoticesResponse> {
    const repository = this.dataSource.getRepository(NoticeEntity);
    const notice = await repository.findOne({ where: { id, userId: user.id } });
    if (!notice) throw new ApiException(404, "not_found");
    if (!notice.readAt) await repository.update({ id }, { readAt: new Date() });
    return this.list(user);
  }

  async readAll(user: User): Promise<NoticesResponse> {
    await this.dataSource
      .getRepository(NoticeEntity)
      .update({ userId: user.id, readAt: IsNull() }, { readAt: new Date() });
    return this.list(user);
  }
}
