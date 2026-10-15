import { type ApiClient, ApiError, type User } from "@hrcc/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

export const ME_QUERY_KEY = ["me"] as const;

/**
 * `null` means "not signed in". Never refetched on its own: sign-in and sign-out
 * call `setSignedInUser`. (Pass a typed `User` variable, not an object literal:
 * `setQueryData` on a `User | null` query rejects literals at compile time.)
 */
export function meQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await api.getMe()).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    // Keep a cached "signed out" (null) even when no component is subscribed.
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function setSignedInUser(queryClient: QueryClient, user: User | null): void {
  queryClient.setQueryData(ME_QUERY_KEY, user);
}
