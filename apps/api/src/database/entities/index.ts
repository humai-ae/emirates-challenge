import { AuditEventEntity } from "./audit-event.entity.js";
import { DatasetEntity } from "./dataset.entity.js";
import { DatasetColumnEntity, type StoredColumnProfile } from "./dataset-column.entity.js";
import { DatasetFileEntity } from "./dataset-file.entity.js";
import { EmployeeRowEntity } from "./employee-row.entity.js";
import { FindingFormatEntity } from "./finding-format.entity.js";
import { PolicyUploadEntity } from "./policy-upload.entity.js";
import { RuleEntity } from "./rule.entity.js";
import { RuleVersionEntity, type StoredCheck } from "./rule-version.entity.js";
import { RunEntity, type RunRuleSnapshot } from "./run.entity.js";
import { RunResultEntity } from "./run-result.entity.js";
import { SessionEntity } from "./session.entity.js";
import { TeamEntity } from "./team.entity.js";
import { TransactionRowEntity } from "./transaction-row.entity.js";
import { UserEntity } from "./user.entity.js";

export {
  AuditEventEntity,
  DatasetColumnEntity,
  DatasetEntity,
  DatasetFileEntity,
  EmployeeRowEntity,
  FindingFormatEntity,
  PolicyUploadEntity,
  RuleEntity,
  RuleVersionEntity,
  RunEntity,
  RunResultEntity,
  type RunRuleSnapshot,
  SessionEntity,
  type StoredCheck,
  type StoredColumnProfile,
  TeamEntity,
  TransactionRowEntity,
  UserEntity,
};

export const entities = [
  TeamEntity,
  UserEntity,
  SessionEntity,
  AuditEventEntity,
  DatasetEntity,
  DatasetFileEntity,
  DatasetColumnEntity,
  TransactionRowEntity,
  EmployeeRowEntity,
  PolicyUploadEntity,
  RuleEntity,
  RuleVersionEntity,
  FindingFormatEntity,
  RunEntity,
  RunResultEntity,
];
