export const DATASETS_QUERY_KEY = ["datasets"] as const;

export function datasetQueryKey(id: string) {
  return [...DATASETS_QUERY_KEY, id] as const;
}
