export const SECOND_OPINIONS_QUERY_KEY = ["second-opinions"] as const;
export const OPINIONS_LIST_QUERY_KEY = [...SECOND_OPINIONS_QUERY_KEY, "list"] as const;

export function opinionQueryKey(id: string) {
  return [...SECOND_OPINIONS_QUERY_KEY, "opinion", id] as const;
}

/** A probability as a whole percentage. */
export const percentOf = (probability: number) => Math.round(probability * 100);
