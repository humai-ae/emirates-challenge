import type { ManagedUser, TeamSummary, User } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { type TeamEntity, UserEntity } from "../database/entities/index.js";

export function toTeamSummary(team: TeamEntity): TeamSummary {
  return { id: team.id, nameEn: team.nameEn, nameAr: team.nameAr };
}

export function toUserDto(user: UserEntity): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    locale: user.locale,
    team: user.team ? toTeamSummary(user.team) : null,
    mustChangePassword: user.mustChangePassword,
  };
}

/** The admin Users page view; never includes the password hash. */
export function toManagedUserDto(user: UserEntity): ManagedUser {
  return {
    ...toUserDto(user),
    isActive: user.isActive,
    isDemo: user.isDemo,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  /** `email` must already be normalised; the request schema trims and lower-cases it. */
  findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email }, relations: { team: true } });
  }
}
