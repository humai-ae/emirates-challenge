import type { DataIssue, DatasetFileKind, Locale } from "@hrcc/shared";
import { useTranslation } from "react-i18next";
import { formatCount } from "./format";

const FILES: readonly DatasetFileKind[] = ["transactions", "employees"];

/** Each issue as a labelled fact ("Blank values in approver_1_id: 2"), grouped by file. */
export function DatasetIssues({ issues, locale }: { issues: DataIssue[]; locale: Locale }) {
  const { t } = useTranslation("admin");
  if (issues.length === 0) return <p className="text-muted">{t("dataset.issues.none")}</p>;
  return (
    <div className="flex flex-col gap-4">
      {FILES.map((file) => {
        const inFile = issues.filter((issue) => issue.file === file);
        if (inFile.length === 0) return null;
        return (
          <section key={file}>
            <h3 className="mb-2 font-semibold">{t(`dataset.files.${file}`)}</h3>
            <ul className="flex flex-col gap-2">
              {inFile.map((issue, index) => (
                <li
                  key={`${issue.code}-${issue.column ?? ""}-${index}`}
                  data-testid="dataset-issue"
                >
                  {t(`dataset.issues.${issue.code}`)}
                  {issue.column ? (
                    <>
                      {" "}
                      <bdi className="font-mono text-sm">{issue.column}</bdi>
                    </>
                  ) : null}
                  {`: ${formatCount(issue.count, locale)}`}
                  {issue.examples.length > 0 ? (
                    <div className="text-sm text-muted">
                      {t("dataset.issues.examples")} <bdi>{issue.examples.join(", ")}</bdi>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
