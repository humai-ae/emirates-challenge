import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type EntityManager, Repository } from "typeorm";
import { ENV, type Env } from "../config/env.js";
import { SessionEntity, type UserEntity } from "../database/entities/index.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(
    manager: EntityManager,
    userId: string,
    now: Date = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_HOURS * 3_600_000);
    await manager.insert(SessionEntity, {
      id: hashToken(token),
      userId,
      createdAt: now,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /** The session's user, or null when the token is unknown or expired (expired rows are removed). */
  async resolve(token: string, now: Date = new Date()): Promise<UserEntity | null> {
    const session = await this.sessions.findOne({
      where: { id: hashToken(token) },
      relations: { user: { team: true } },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.sessions.delete({ id: session.id });
      return null;
    }
    return session.user;
  }

  async destroy(manager: EntityManager, token: string): Promise<void> {
    await manager.delete(SessionEntity, { id: hashToken(token) });
  }
}
