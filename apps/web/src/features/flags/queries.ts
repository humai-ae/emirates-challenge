import type { ApiClient } from "@hrcc/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

export const FLAGS_QUERY_KEY = ["flags"] as const;
export const COUNTS_QUERY_KEY = ["counts"] as const;
export const NOTICES_QUERY_KEY = ["notices"] as const;

export function flagQueryKey(id: string) {
  return [...FLAGS_QUERY_KEY, "flag", id] as const;
}

/** The badge numbers: refreshed every 30 seconds and after every change. */
export function countsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: COUNTS_QUERY_KEY,
    queryFn: () => api.getCounts(),
    refetchInterval: 30_000,
  });
}

/** After any change to a flag: every list of flags, the flags, the badges and the notices. */
export async function refreshAfterFlagChange(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: FLAGS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: COUNTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY }),
  ]);
}
