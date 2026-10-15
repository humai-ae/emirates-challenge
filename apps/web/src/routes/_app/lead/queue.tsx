import { meQueryOptions, useLocaleSwitch } from "@hrcc/ui/app";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "../../../components/empty-page";
import { teamNameFor } from "../../../lib/team-name";

export const Route = createFileRoute("/_app/lead/queue")({ component: QueuePage });

function QueuePage() {
  const { api } = Route.useRouteContext();
  const { data: user } = useQuery(meQueryOptions(api));
  const { locale } = useLocaleSwitch();
  return (
    <EmptyPage page="queue" values={{ team: teamNameFor(user?.team ?? null, locale) ?? "" }} />
  );
}
