import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DataPage } from "../../features/data/data-page";

export const Route = createFileRoute("/_app/data")({ component: DataRoute });

function DataRoute() {
  const { api } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <DataPage
      api={api}
      onUploaded={(dataset) =>
        void navigate({ to: "/data/$datasetId", params: { datasetId: dataset.id } })
      }
    />
  );
}
