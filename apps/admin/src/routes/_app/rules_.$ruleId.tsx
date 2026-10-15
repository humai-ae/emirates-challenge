import { createFileRoute } from "@tanstack/react-router";
import { RulePage } from "../../features/rules/rule-page";

export const Route = createFileRoute("/_app/rules_/$ruleId")({ component: RuleRoute });

function RuleRoute() {
  const { api } = Route.useRouteContext();
  const { ruleId } = Route.useParams();
  return <RulePage api={api} ruleId={ruleId} />;
}
