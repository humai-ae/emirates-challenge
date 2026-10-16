import type { FlagDetail, Locale, SeverityReason } from "@hrcc/shared";
import { Card, Tag } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { teamNameFor } from "../../lib/team-name";
import { explanationOf, formatDay, formatMoment, formatNumber, SEVERITY_TONES } from "./format";

export type FlagRole = "analyst" | "lead";

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </Card>
  );
}

/** A link to another flag, on the page for the reader's role. */
export function FlagLink({
  id,
  reader,
  className,
  children,
}: {
  id: string;
  reader: FlagRole;
  className?: string;
  children: ReactNode;
}) {
  return reader === "lead" ? (
    <Link to="/lead/flags/$flagId" params={{ flagId: id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/analyst/flags/$flagId" params={{ flagId: id }} className={className}>
      {children}
    </Link>
  );
}

export function WhySection({ flag, locale }: { flag: FlagDetail; locale: Locale }) {
  const { t } = useTranslation("web");
  return (
    <Section title={t("flag.why")} testId="flag-why">
      <p dir="auto">{explanationOf(flag, locale)}</p>
      <p className="mt-2 text-sm text-muted">
        {t(flag.explanationSource === "ai" ? "flag.aiWording" : "flag.standardWording")}
      </p>
      {flag.kind === "ai_judgment" ? (
        <p className="mt-2 text-sm text-ai">{t("flag.aiJudgment")}</p>
      ) : null}
      {flag.kind === "unusual_pattern" ? <p className="mt-2 text-sm">{t("flag.pattern")}</p> : null}
    </Section>
  );
}

export function RuleSection({ flag, locale }: { flag: FlagDetail; locale: Locale }) {
  const { t } = useTranslation("web");
  const restatement = locale === "ar" ? flag.restatementAr : flag.restatementEn;
  return (
    <Section title={t("flag.rule")}>
      <p className="font-semibold">
        <bdi>{flag.ruleId}</bdi> · <bdi>{flag.ruleTitle}</bdi>{" "}
        <span className="text-sm font-normal text-muted">
          {t("flag.ruleVersion", { version: flag.ruleVersion })}
        </span>
      </p>
      {restatement ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-muted">{t("flag.ruleDoes")}</h3>
          <p dir="auto">{restatement}</p>
        </>
      ) : null}
      {flag.ruleText ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-muted">{t("flag.policySays")}</h3>
          <p dir="auto" className="whitespace-pre-wrap">
            {flag.ruleText}
          </p>
        </>
      ) : null}
    </Section>
  );
}

const valueText = (value: string | readonly string[]) =>
  typeof value === "string" ? value : value.join(", ");

export function ProofSection({ flag, reader }: { flag: FlagDetail; reader: FlagRole }) {
  const { t } = useTranslation("web");
  const cell = "border-b border-line px-2 py-1.5";
  return (
    <Section title={t("flag.proof")} testId="flag-proof">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {(["field", "shows", "needs"] as const).map((column) => (
              <th key={column} className={`${cell} text-start font-semibold text-muted`}>
                {t(`flag.columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flag.evidence.map((item, index) => (
            <tr key={`${item.field}-${index}`} data-testid="evidence-row">
              <td className={cell}>
                <bdi>{item.field}</bdi>
              </td>
              <td className={`${cell} font-semibold text-high`}>
                <bdi>{valueText(item.value) || "—"}</bdi>
              </td>
              <td className={cell}>
                <bdi>{item.condition}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-4 mb-1 text-sm font-semibold text-muted">{t("flag.people")}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {flag.people.map((person, index) => (
          <li key={`${person.role}-${person.id}-${index}`}>
            <span className="font-semibold">{t(`flag.role.${person.role}`)}</span>{" "}
            <bdi>{person.id}</bdi> ·{" "}
            {person.found
              ? t("flag.personFound", {
                  grade: person.grade ?? t("flag.unknown"),
                  department: person.department ?? t("flag.unknown"),
                })
              : t("flag.personMissing")}
          </li>
        ))}
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-primary">
          {t("flag.transaction")}
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {flag.transaction.map((item) => (
            <div key={item.column} className="contents">
              <dt className="text-muted">
                <bdi>{item.column}</bdi>
              </dt>
              <dd>
                <bdi>{item.value || "—"}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </details>
      {flag.related.length > 0 ? (
        <p className="mt-4 text-sm">
          {t("flag.related")}:{" "}
          {flag.related.map((other, index) => (
            <span key={other.id}>
              {index > 0 ? ", " : null}
              <FlagLink id={other.id} reader={reader} className="text-primary underline">
                <bdi>{other.ruleId}</bdi> · <bdi>{other.ruleTitle}</bdi>
              </FlagLink>
            </span>
          ))}
        </p>
      ) : null}
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export function NextSection({ flag, locale }: { flag: FlagDetail; locale: Locale }) {
  const { t } = useTranslation("web");
  const severity = (value: string) => t(`flags.severity.${value}`);
  const reason = (item: SeverityReason): string => {
    switch (item.code) {
      case "rule_default":
        return t("flag.reasons.rule_default", { severity: severity(item.severity) });
      case "amount_over_double_limit":
        return t("flag.reasons.amount_over_double_limit", {
          amount: formatNumber(item.amount, locale),
          limit: formatNumber(item.limit, locale),
        });
      case "repeat_open_flag":
        return t(`flag.reasons.repeat_open_flag_${item.person}`, {
          personId: item.personId,
          flagId: item.flagId,
        });
      case "low_confidence_cap":
        return t("flag.reasons.low_confidence_cap");
      case "analyst_change":
        return t("flag.reasons.analyst_change", {
          from: severity(item.from),
          to: severity(item.to),
          by: item.by,
        });
    }
  };
  const { reportTo, decision, assignment, fix, verification } = flag;
  const team = teamNameFor(flag.ownerTeam, locale);
  return (
    <Section title={t("flag.next")} testId="flag-next">
      <dl className="flex flex-col gap-3 text-sm">
        <Fact label={t("flag.severity")}>
          <Tag tone={SEVERITY_TONES[flag.severity]}>{severity(flag.severity)}</Tag>
          <ul className="mt-1 list-disc ps-5">
            {flag.severityReasons.map((item, index) => (
              <li key={`${item.code}-${index}`}>{reason(item)}</li>
            ))}
          </ul>
        </Fact>
        <Fact label={t("flag.goesTo")}>{team ? <bdi>{team}</bdi> : t("flag.noTeamYet")}</Fact>
        <Fact label={t("flag.fixBy")}>
          {formatDay(flag.dueDate, locale)}{" "}
          {flag.overdue ? <Tag tone="high">{t("flags.overdue")}</Tag> : null}
        </Fact>
        <Fact label={t("flag.reportTo")}>
          <p className="font-semibold">{t(`flag.levels.${reportTo.level}`)}</p>
          <p>
            {reportTo.basis
              ? t("flag.basis", {
                  who: t(`flag.who.${reportTo.basis.role}`),
                  id: reportTo.basis.id,
                  grade: formatNumber(reportTo.basis.grade, locale),
                  band: t(`flag.bands.${reportTo.band}`),
                })
              : t("flag.noBasis")}
          </p>
          {reportTo.personId ? (
            <p>
              {t("flag.reportPerson", {
                level: t(`flag.levels.${reportTo.level}`),
                id: reportTo.personId,
              })}
            </p>
          ) : null}
          <p className="text-muted">{t("flag.reportNote")}</p>
        </Fact>
        <Fact label={t("flag.suggestedFix")}>
          <span dir="auto">{locale === "ar" ? flag.suggestedFixAr : flag.suggestedFixEn}</span>
        </Fact>
        {flag.seenAgainRuns.length > 0 ? (
          <p>
            {t("flag.seenAgain", { runs: flag.seenAgainRuns.map((run) => run.runId).join(", ") })}
          </p>
        ) : null}
        {decision ? (
          <div data-testid="flag-outcome" className="flex flex-col gap-1">
            <p>
              {decision.action === "confirm"
                ? t("flag.decided.confirm", {
                    by: decision.by,
                    date: formatMoment(decision.at, locale),
                  })
                : t("flag.decided.dismiss", {
                    by: decision.by,
                    date: formatMoment(decision.at, locale),
                    reason: decision.reason ? t(`flags.dismissReason.${decision.reason}`) : "",
                  })}
            </p>
            {decision.note ? <p dir="auto">{t("flag.note", { note: decision.note })}</p> : null}
            {decision.changes.map((change) => (
              <p key={change.field}>
                {change.field === "suggested_fix"
                  ? t("flag.changes.suggested_fix")
                  : t(`flag.changes.${change.field}`, {
                      from:
                        change.field === "severity" && change.from
                          ? severity(change.from)
                          : (change.from ?? "—"),
                      to: change.field === "severity" ? severity(change.to) : change.to,
                    })}
              </p>
            ))}
            {decision.changeReason ? (
              <p dir="auto">{t("flag.changeReason", { reason: decision.changeReason })}</p>
            ) : null}
            {assignment ? (
              <p>{t("flag.assigned", { assignee: assignment.assignee, by: assignment.by })}</p>
            ) : null}
            {fix ? (
              <p dir="auto">
                {t("flag.fixRecorded", {
                  by: fix.by,
                  date: formatMoment(fix.at, locale),
                  type: t(`flags.fixType.${fix.type}`),
                })}{" "}
                {fix.note}
              </p>
            ) : null}
            {verification ? (
              <p>
                {t("flag.verified", {
                  by: verification.by,
                  date: formatMoment(verification.at, locale),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </dl>
    </Section>
  );
}
