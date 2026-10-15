import { type DemoUser, ROLES, type User } from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { type TeamEntity, UserEntity } from "../database/entities/index.js";

function toTeamSummary(team: TeamEntity | null) {
  return team ? { id: team.id, nameEn: team.nameEn, nameAr: team.nameAr } : null;
}

export function toUserDto(user: UserEntity): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    locale: user.locale,
    team: toTeamSummary(user.team),
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  async listDemoUsers(): Promise<DemoUser[]> {
    const users = await this.users.find({ where: { isDemo: true }, relations: { team: true } });
    return users
      .sort(
        (a, b) =>
          ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
          a.displayName.localeCompare(b.displayName),
      )
      .map((user) => ({
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        team: toTeamSummary(user.team),
      }));
  }

  findDemoUser(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id, isDemo: true }, relations: { team: true } });
  }
}
