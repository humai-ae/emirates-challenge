import type { ApiClient, RoutingProposal, RoutingResponse, TeamSummary } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCount } from "../data/format";
import { ROUTING_QUERY_KEY, TEAMS_QUERY_KEY } from "./teams-query";

type Proposal = RoutingProposal["proposals"][number];
const CELL = "border-b border-line px-2.5 py-2";

const savedChoices = (routing: RoutingResponse): Record<string, string> =>
  Object.fromEntries(routing.rows.map((row) => [row.type, row.team?.nameEn ?? ""]));

/** Who owns findings on each transaction type: suggested from the policy and AI, saved by the admin. */
export function RoutingCard({ api }: { api: ApiClient }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const routing = useQuery({ queryKey: ROUTING_QUERY_KEY, queryFn: () => api.getRouting() });
  const teams = useQuery({ queryKey: TEAMS_QUERY_KEY, queryFn: () => api.listTeams() });
  // Null until the admin changes something: then it holds every row's choice.
  const [choices, setChoices] = useState<Record<string, string> | null>(null);
  const [proposed, setProposed] = useState<Record<string, Proposal>>({});
  const [saved, setSaved] = useState(false);
  const known = teams.data?.teams ?? [];
  const shown = choices ?? (routing.data ? savedChoices(routing.data) : {});
  const choose = (next: Record<string, string>) => {
    setSaved(false);
    setChoices(next);
  };
  const propose = useMutation({
    mutationFn: () => api.proposeRouting(),
    onSuccess: (proposal) => {
      // A suggested name matches an existing team whatever its case; new names keep their first spelling.
      const spelling = new Map(known.map((team) => [team.nameEn.toLowerCase(), team.nameEn]));
      const canonical = (name: string) => {
        const key = name.toLowerCase();
        if (!spelling.has(key)) spelling.set(key, name);
        return spelling.get(key) ?? name;
      };
      setProposed(Object.fromEntries(proposal.proposals.map((item) => [item.type, item])));
      choose({
        ...shown,
        ...Object.fromEntries(proposal.proposals.map((item) => [item.type, canonical(item.team)])),
      });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api.saveRouting({
        rows: (routing.data?.rows ?? []).map((row) => ({
          type: row.type,
          teamName: shown[row.type] || null,
        })),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(ROUTING_QUERY_KEY, response);
      void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      setChoices(null);
      setProposed({});
      setSaved(true);
    },
  });

  if (routing.isPending || teams.isPending) {
    return (
      <Card className="mb-4">
        <p className="text-muted">{tUi("states.loading")}</p>
      </Card>
    );
  }
  if (routing.isError || teams.isError) {
    return (
      <Card className="mb-4">
        <p className="text-high">{tUi("states.error")}</p>
      </Card>
    );
  }
  const label = (team: TeamSummary) => (locale === "ar" && team.nameAr) || team.nameEn;
  const newNames = [
    ...new Set(
      Object.values(shown).filter(
        (name) => name && !known.some((team) => team.nameEn.toLowerCase() === name.toLowerCase()),
      ),
    ),
  ];
  return (
    <Card className="mb-4">
      <h2 className="mb-1 text-lg font-bold">{t("teams.routing.title")}</h2>
      <p className="mb-3 text-sm text-muted">{t("teams.routing.body")}</p>
      {routing.data.rows.length === 0 ? (
        <p className="mb-3 text-muted">{t("teams.routing.noTypes")}</p>
      ) : (
        <table className="mb-3 w-full border-collapse">
          <thead>
            <tr>
              <th className={`${CELL} text-start text-sm font-semibold text-muted`}>
                {t("teams.routing.type")}
              </th>
              <th className={`${CELL} text-start text-sm font-semibold text-muted`}>
                {t("teams.routing.team")}
              </th>
            </tr>
          </thead>
          <tbody>
            {routing.data.rows.map((row) => {
              const proposal = proposed[row.type];
              return (
                <tr key={row.type} data-testid="routing-row">
                  <td className={`${CELL} font-mono text-sm`}>
                    <bdi>{row.type}</bdi>
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={t("teams.routing.teamFor", { type: row.type })}
                        value={shown[row.type] ?? ""}
                        onChange={(event) => choose({ ...shown, [row.type]: event.target.value })}
                        className="rounded-[10px] border border-control bg-white px-3 py-2"
                      >
                        <option value="">{t("teams.routing.unassigned")}</option>
                        {known.map((team) => (
                          <option key={team.id} value={team.nameEn}>
                            {label(team)}
                          </option>
                        ))}
                        {newNames.map((name) => (
                          <option key={name} value={name}>
                            {t("teams.routing.newTeam", { name })}
                          </option>
                        ))}
                      </select>
                      {proposal ? (
                        <Tag tone={proposal.source === "ai" ? "ai" : "info"}>
                          {proposal.source === "ai"
                            ? t("teams.routing.fromAi", {
                                percent: formatCount(
                                  Math.round((proposal.confidence ?? 0) * 100),
                                  locale,
                                ),
                              })
                            : t("teams.routing.fromPolicy")}
                        </Tag>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {propose.isError || save.isError ? (
        <p role="alert" className="mb-3 text-high">
          {apiErrorMessage(propose.error ?? save.error, tUi)}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mb-3 text-ok">
          {t("teams.routing.saved")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => propose.mutate()}
          disabled={propose.isPending || routing.data.rows.length === 0}
        >
          {t("teams.routing.suggest")}
        </Button>
        <Button
          variant="primary"
          onClick={() => save.mutate()}
          disabled={choices === null || save.isPending}
        >
          {t("teams.routing.save")}
        </Button>
      </div>
    </Card>
  );
}
