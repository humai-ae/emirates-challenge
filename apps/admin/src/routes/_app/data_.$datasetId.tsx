import { createFileRoute } from "@tanstack/react-router";
import { DatasetPage } from "../../features/data/dataset-page";

export const Route = createFileRoute("/_app/data_/$datasetId")({ component: DatasetRoute });

function DatasetRoute() {
  const { api } = Route.useRouteContext();
  const { datasetId } = Route.useParams();
  return <DatasetPage api={api} datasetId={datasetId} />;
}
