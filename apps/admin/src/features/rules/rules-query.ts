export const RULES_QUERY_KEY = ["rules"] as const;

export function ruleQueryKey(id: string) {
  return [...RULES_QUERY_KEY, id] as const;
}
