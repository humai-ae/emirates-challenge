import { randomUUID } from "node:crypto";
import {
  type CreateUserRequest,
  CreateUserRequestSchema,
  type ManagedUserResponse,
  type ResetPasswordRequest,
  ResetPasswordRequestSchema,
  ROLES,
  type User,
  type UsersListResponse,
} from "@hrcc/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager } from "typeorm";
import { z } from "zod";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { hashPassword } from "../auth/password.js";
import { SessionService } from "../auth/session.service.js";
import { toManagedUserDto } from "../auth/users.service.js";
import { ApiException } from "../common/api-exception.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TeamEntity, UserEntity } from "../database/entities/index.js";
import { isUniqueViolation } from "../database/errors.js";

const UserIdPipe = new ZodValidationPipe(z.uuid());

function loadUser(manager: EntityManager, id: string): Promise<UserEntity> {
  return manager.findOneOrFail(UserEntity, { where: { id }, relations: { team: true } });
}

@Controller("users")
@Roles("admin")
export class UsersController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(): Promise<UsersListResponse> {
    const users = await this.dataSource
      .getRepository(UserEntity)
      .find({ relations: { team: true } });
    users.sort(
      (a, b) =>
        ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
        a.displayName.localeCompare(b.displayName) ||
        a.email.localeCompare(b.email),
    );
    return { users: users.map(toManagedUserDto) };
  }

  /** New users choose their own password at first sign-in. */
  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() admin: User,
    @Body(new ZodValidationPipe(CreateUserRequestSchema)) body: CreateUserRequest,
  ): Promise<ManagedUserResponse> {
    const passwordHash = await hashPassword(body.password);
    const user = await this.dataSource.transaction(async (manager) => {
      if (body.teamId !== null && !(await manager.existsBy(TeamEntity, { id: body.teamId }))) {
        throw new ApiException(400, "team_not_found");
      }
      const id = randomUUID();
      try {
        await manager.insert(UserEntity, {
          id,
          email: body.email,
          displayName: body.displayName,
          role: body.role,
          teamId: body.teamId,
          locale: body.locale,
          passwordHash,
          mustChangePassword: true,
          isActive: true,
          isDemo: false,
        });
      } catch (error) {
        if (isUniqueViolation(error, "users_email_key")) throw new ApiException(409, "email_taken");
        throw error;
      }
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "user.create",
        objectType: "user",
        objectId: id,
        after: {
          email: body.email,
          displayName: body.displayName,
          role: body.role,
          teamId: body.teamId,
          locale: body.locale,
        },
      });
      return loadUser(manager, id);
    });
    return { user: toManagedUserDto(user) };
  }

  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @CurrentUser() admin: User,
    @Param("id", UserIdPipe) id: string,
  ): Promise<ManagedUserResponse> {
    if (id === admin.id) throw new ApiException(409, "own_account");
    const user = await this.dataSource.transaction(async (manager) => {
      const target = await this.findTarget(manager, id);
      if (!target.isActive) return loadUser(manager, id);
      if (target.role === "admin") {
        // Locks every active admin row, so two admins deactivating each other cannot both succeed.
        const admins: Array<{ id: string }> = await manager.query(
          "SELECT id FROM users WHERE role = 'admin' AND is_active FOR UPDATE",
        );
        if (!admins.some((row) => row.id !== id)) throw new ApiException(409, "last_admin");
      }
      await manager.update(UserEntity, { id }, { isActive: false });
      await this.sessions.destroyAllForUser(manager, id);
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "user.deactivate",
        objectType: "user",
        objectId: id,
        after: { email: target.email },
      });
      return loadUser(manager, id);
    });
    return { user: toManagedUserDto(user) };
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentUser() admin: User,
    @Param("id", UserIdPipe) id: string,
  ): Promise<ManagedUserResponse> {
    const user = await this.dataSource.transaction(async (manager) => {
      const target = await this.findTarget(manager, id);
      if (target.isActive) return loadUser(manager, id);
      await manager.update(UserEntity, { id }, { isActive: true });
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "user.reactivate",
        objectType: "user",
        objectId: id,
        after: { email: target.email },
      });
      return loadUser(manager, id);
    });
    return { user: toManagedUserDto(user) };
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  async resetPassword(
    @CurrentUser() admin: User,
    @Param("id", UserIdPipe) id: string,
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema)) body: ResetPasswordRequest,
  ): Promise<ManagedUserResponse> {
    if (id === admin.id) throw new ApiException(409, "own_account");
    const passwordHash = await hashPassword(body.password);
    const user = await this.dataSource.transaction(async (manager) => {
      const target = await this.findTarget(manager, id);
      await manager.update(UserEntity, { id }, { passwordHash, mustChangePassword: true });
      await this.sessions.destroyAllForUser(manager, id);
      await this.audit.append(manager, {
        actor: actorOf(admin),
        action: "user.password_reset",
        objectType: "user",
        objectId: id,
        after: { email: target.email },
      });
      return loadUser(manager, id);
    });
    return { user: toManagedUserDto(user) };
  }

  private async findTarget(manager: EntityManager, id: string): Promise<UserEntity> {
    const target = await manager.findOneBy(UserEntity, { id });
    if (!target) throw new ApiException(404, "not_found");
    return target;
  }
}
