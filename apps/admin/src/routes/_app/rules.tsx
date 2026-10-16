import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RulesPage } from "../../features/rules/rules-page";

export const Route = createFileRoute("/_app/rules")({ component: RulesRoute });

function RulesRoute() {
  const { api } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <RulesPage
      api={api}
      onCreated={(rule) => void navigate({ to: "/rules/$ruleId", params: { ruleId: rule.id } })}
    />
  );
}
