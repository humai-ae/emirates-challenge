import { AuditEventEntity } from "./audit-event.entity.js";
import { SessionEntity } from "./session.entity.js";
import { TeamEntity } from "./team.entity.js";
import { UserEntity } from "./user.entity.js";

export { AuditEventEntity, SessionEntity, TeamEntity, UserEntity };

export const entities = [TeamEntity, UserEntity, SessionEntity, AuditEventEntity];
