import type { ApiClient, Rule, RuleResponse } from "@hrcc/shared";
import { apiErrorMessage, Button } from "@hrcc/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ReasonDialog } from "./reason-dialog";
import { RedraftDialog } from "./redraft-dialog";
import { liveVersion, openVersion } from "./rule-status";

/** Opening a new draft and retiring act on the whole rule; the draft's own decisions sit in its form. */
export function RuleActions({
  api,
  rule,
  onChanged,
}: {
  api: ApiClient;
  rule: Rule;
  onChanged: (response: RuleResponse) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const live = liveVersion(rule);
  const open = openVersion(rule);
  const edit = useMutation({
    mutationFn: () => api.editRule(rule.id, { rowVersion: rule.rowVersion }),
    onSuccess: onChanged,
  });
  return (
    <>
      {open && open.status !== "drafting" ? (
        <RedraftDialog api={api} rule={rule} onDone={onChanged} />
      ) : null}
      {open ? null : (
        <Button disabled={edit.isPending} onClick={() => edit.mutate()}>
          {t(live ? "rules.actions.edit" : "rules.actions.draftAgain")}
        </Button>
      )}
      {live ? (
        <ReasonDialog
          kind="retire"
          rule={rule}
          act={(input) => api.retireRule(rule.id, input)}
          onDone={onChanged}
        />
      ) : null}
      {edit.isError ? (
        <p role="alert" className="text-high">
          {apiErrorMessage(edit.error, tUi)}
        </p>
      ) : null}
    </>
  );
}
