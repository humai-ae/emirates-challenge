/** People's IDs swapped for tokens before text goes to AI, and back in what it writes. */
export interface Pseudonyms {
  /** The tokens in use, "[EMP_1]" first. */
  readonly tokens: string[];
  hide(text: string): string;
  show(text: string): string;
}

const TOKEN = /\[EMP_\d{1,3}\]/g;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function pseudonymsFor(ids: readonly (string | null | undefined)[]): Pseudonyms {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id?.trim())))];
  const byId = new Map(unique.map((id, index) => [id, `[EMP_${index + 1}]`]));
  const byToken = new Map([...byId].map(([id, token]) => [token, id]));
  // Longest first, and only whole IDs: "E-11" must not match inside "E-1182" or "XE-11".
  const longestFirst = [...byId.keys()].sort((a, b) => b.length - a.length);
  const pattern =
    longestFirst.length > 0
      ? new RegExp(
          `(?<![A-Za-z0-9_-])(?:${longestFirst.map(escapeRegExp).join("|")})(?![A-Za-z0-9_-])`,
          "g",
        )
      : null;
  return {
    tokens: [...byToken.keys()],
    hide: (text) => (pattern ? text.replace(pattern, (id) => byId.get(id) ?? id) : text),
    show: (text) => text.replace(TOKEN, (token) => byToken.get(token) ?? token),
  };
}
