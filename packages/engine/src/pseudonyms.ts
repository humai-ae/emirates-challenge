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

const WORD = /[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?/g;
const shapeOf = (id: string) => id.replace(/\d/g, "9");

/**
 * People's IDs that texts mention beyond the people already known, such as a reporting line in a
 * finding's evidence. A word counts when the employees file has it, or when it has letters and
 * digits in the same pattern as a known person's ID ("E-0003" like "E-0049"). The flag's own
 * transaction and rule IDs, passed as `exclude`, never count.
 */
export function personIdsIn(
  texts: readonly string[],
  known: readonly string[],
  employees: ReadonlySet<string> = new Set(),
  exclude: readonly string[] = [],
): string[] {
  const shapes = new Set(known.filter(Boolean).map(shapeOf));
  const excluded = new Set(exclude);
  const found = new Set<string>();
  for (const text of texts) {
    for (const [word] of text.matchAll(WORD)) {
      if (excluded.has(word) || found.has(word)) continue;
      const shaped = /[A-Za-z]/.test(word) && /\d/.test(word) && shapes.has(shapeOf(word));
      if (shaped || employees.has(word)) found.add(word);
    }
  }
  return [...found];
}
