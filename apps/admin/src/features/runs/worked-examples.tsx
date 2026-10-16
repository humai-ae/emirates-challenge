import type { WorkedExample } from "@hrcc/shared";
import { Card, Tag } from "@hrcc/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function WorkedExamples({ examples }: { examples: WorkedExample[] | null }) {
  const { t } = useTranslation("admin");
  return (
    <Card className="mb-4">
      <h2 className="mb-2 text-lg font-bold">{t("runs.examples.title")}</h2>
      {examples === null ? (
        <p className="text-muted">
          {t("runs.examples.none")}{" "}
          <Link to="/finding-format" className="font-semibold text-primary hover:underline">
            {t("runs.export.goToFormat")}
          </Link>
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{t("runs.examples.body")}</p>
          <ul className="flex flex-col gap-1">
            {examples.map((example) => (
              <li
                key={example.row}
                data-testid="worked-example"
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-semibold">
                  {t("runs.examples.example", { row: example.row })}
                </span>
                <span className="font-mono">
                  <bdi>{example.transactionId}</bdi> · <bdi>{example.ruleId}</bdi>
                </span>
                <Tag tone={example.result === "found" ? "ok" : "warn"}>
                  {t(`runs.examples.results.${example.result}`)}
                </Tag>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
