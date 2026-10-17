import {
  type AuditAction,
  type OpinionCode,
  RunTotalsSchema,
  SECOND_OPINION_LIST,
  type SecondOpinion,
  type SecondOpinionResponse,
  type SecondOpinionsResponse,
  type User,
} from "@hrcc/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { actorOf } from "../audit/actor.js";
import { AuditService } from "../audit/audit.service.js";
import { ApiException } from "../common/api-exception.js";
import { RuleVersionEntity, RunEntity, SecondOpinionEntity } from "../database/entities/index.js";
import { cellsOf } from "../flags/flag-creation.service.js";
import { CheckDatasetsService } from "../rules/check-datasets.service.js";

/** A second opinion as read, with who acted on it and the flag behind it. */
interface OpinionRow {
  id: string;
  run_id: string;
  rule_id: string;
  rule_version: number;
  row_no: number;
  transaction_id: string | null;
  code: OpinionCode;
  p_break: number;
  p_enough: number;
  strength: number;
  noted_name: string | null;
  noted_at: Date | null;
  review_name: string | null;
  review_requested_at: Date | null;
  flag_id: string | null;
}

/**
 * Second opinions with the names of who noted them or asked for a review, and, where the check
 * flagged the transaction, its flag: the one the run raised, or the earlier one it found again.
 */
const SELECT_OPINIONS = `
  SELECT o.id, o.run_id, o.rule_id, o.rule_version, o.row_no, o.transaction_id, o.code, o.p_break,
    o.p_enough, o.strength, noted.display_name AS noted_name, o.noted_at,
    review.display_name AS review_name, o.review_requested_at,
    (SELECT f.id FROM flags f
     WHERE o.code = 'flagged' AND f.kind = 'rule_break' AND f.rule_id = o.rule_id
       AND ((f.run_id = o.run_id AND f.row_no = o.row_no)
         OR (o.transaction_id = ANY (f.transaction_ids)
           AND f.seen_again @> jsonb_build_array(jsonb_build_object('runId', o.run_id))))
     ORDER BY f.id LIMIT 1) AS flag_id
  FROM second_opinions o
  LEFT JOIN users noted ON noted.id = o.noted_by
  LEFT JOIN users review ON review.id = o.review_requested_by`;

const acted = (by: string | null, at: Date | null) =>
  by !== null && at !== null ? { by, at: at.toISOString() } : null;

/** The rule's title as the run saw it. */
const titleIn = (run: RunEntity | null, ruleId: string) =>
  run?.rules.find((rule) => rule.ruleId === ruleId)?.title ?? ruleId;

function toOpinion(row: OpinionRow, ruleTitle: string): SecondOpinion {
  return {
    id: row.id,
    runId: row.run_id,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    ruleTitle,
    transactionId: row.transaction_id,
    rowNo: row.row_no,
    code: row.code,
    pBreak: row.p_break,
    enough: row.p_enough,
    strength: row.strength,
    noted: acted(row.noted_name, row.noted_at),
    reviewRequested: acted(row.review_name, row.review_requested_at),
    flagId: row.flag_id,
  };
}

/** The transaction a second opinion is about, as the audit log names it. */
const transactionOf = (opinion: SecondOpinionEntity) =>
  opinion.transactionId ?? `#${opinion.rowNo}`;

/**
 * Where Jev strongly disagrees with a rule's check: analysts read the strongest of a run, mark one
 * noted, or ask for a review of the rule. Never findings: nothing here changes a result or a flag.
 */
@Injectable()
export class SecondOpinionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly datasets: CheckDatasetsService,
  ) {}

  /**
   * A run's strongest disagreements: the run named, or else the newest run that asked, so a later
   * run started without a second opinion doesn't hide the last one's.
   */
  async list(runId: string | undefined): Promise<SecondOpinionsResponse> {
    const runs = this.dataSource.getRepository(RunEntity);
    const run = runId
      ? await runs.findOneBy({ id: runId })
      : await runs
          .createQueryBuilder("run")
          .where("COALESCE(run.totals ->> 'secondOpinionState', 'off') <> 'off'")
          .orderBy("run.startedAt", "DESC")
          .addOrderBy("run.id", "DESC")
          .getOne();
    if (!run) {
      if (runId) throw new ApiException(404, "not_found");
      return { runId: null, progress: null, opinions: [], total: 0 };
    }
    const totals = RunTotalsSchema.parse(run.totals);
    const [rows, counted]: [OpinionRow[], Array<{ total: number }>] = await Promise.all([
      this.dataSource.query(
        `${SELECT_OPINIONS} WHERE o.run_id = $1 ORDER BY o.strength DESC, o.id LIMIT $2`,
        [run.id, SECOND_OPINION_LIST],
      ),
      this.dataSource.query(
        "SELECT count(*)::int AS total FROM second_opinions WHERE run_id = $1",
        [run.id],
      ),
    ]);
    return {
      runId: run.id,
      progress: {
        state: totals.secondOpinionState,
        done: totals.secondOpinionDone,
        transactions: totals.secondOpinionTotal,
      },
      opinions: rows.map((row) => toOpinion(row, titleIn(run, row.rule_id))),
      total: counted[0]?.total ?? 0,
    };
  }

  /** One second opinion, with the policy's words and the transaction's cells while it has them. */
  async detail(id: string): Promise<SecondOpinionResponse> {
    const [row]: OpinionRow[] = await this.dataSource.query(`${SELECT_OPINIONS} WHERE o.id = $1`, [
      id,
    ]);
    if (!row) throw new ApiException(404, "not_found");
    const [run, version] = await Promise.all([
      this.dataSource.getRepository(RunEntity).findOneBy({ id: row.run_id }),
      this.dataSource
        .getRepository(RuleVersionEntity)
        .findOneBy({ ruleId: row.rule_id, version: row.rule_version }),
    ]);
    // A deleted dataset has no rows left: the transaction's cells are gone with it.
    const prepared = run ? (await this.datasets.byId(run.datasetId))?.prepared : undefined;
    const title = titleIn(run, row.rule_id);
    return {
      opinion: {
        ...toOpinion(row, title),
        // What Jev read: the policy's words, or the title when the rule has none.
        ruleText: version?.sourceText || title,
        transaction: prepared
          ? cellsOf(
              prepared.columnNames("transactions"),
              prepared.rows[row.row_no - 1]?.cells ?? {},
            )
          : [],
      },
    };
  }

  async noted(user: User, id: string): Promise<SecondOpinionResponse> {
    return this.act(user, id, "second_opinion.noted", async (manager, opinion, now) => {
      if (opinion.notedAt) throw new ApiException(409, "opinion_already_noted");
      await manager.update(SecondOpinionEntity, { id }, { notedBy: user.id, notedAt: now });
      return { name: `${opinion.ruleId} · ${transactionOf(opinion)}` };
    });
  }

  async review(user: User, id: string): Promise<SecondOpinionResponse> {
    return this.act(user, id, "second_opinion.review_requested", async (manager, opinion, now) => {
      if (opinion.reviewRequestedAt) throw new ApiException(409, "review_already_requested");
      await manager.update(
        SecondOpinionEntity,
        { id },
        { reviewRequestedBy: user.id, reviewRequestedAt: now },
      );
      return { name: opinion.ruleId, transaction: transactionOf(opinion), code: opinion.code };
    });
  }

  /** One action on a second opinion, locked, with its audit event; `apply` says what it did. */
  private async act(
    user: User,
    id: string,
    action: AuditAction,
    apply: (
      manager: EntityManager,
      opinion: SecondOpinionEntity,
      now: Date,
    ) => Promise<Record<string, unknown>>,
  ): Promise<SecondOpinionResponse> {
    await this.dataSource.transaction(async (manager) => {
      const opinion = await manager.findOne(SecondOpinionEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!opinion) throw new ApiException(404, "not_found");
      const now = new Date();
      const after = await apply(manager, opinion, now);
      await this.audit.append(
        manager,
        { actor: actorOf(user), action, objectType: "second_opinion", objectId: id, after },
        now,
      );
    });
    return this.detail(id);
  }
}
