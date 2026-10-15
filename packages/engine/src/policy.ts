import type { PolicyWarning } from "@hrcc/shared";

/** One rule cut from a policy document. */
export interface PolicyRule {
  id: string;
  title: string;
  text: string;
}

export interface PolicySplit {
  rules: PolicyRule[];
  warnings: PolicyWarning[];
}

/** A policy's own rule ID at the start of a heading or line: "R-01", "HR-12", "POL-3a". */
const RULE_ID = /^([A-Za-z]{1,6}-\d{1,4}[A-Za-z]?)(?=[\s.:)\]–—-]|$)[\s.:)\]–—-]*(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const NUMBERED = /^(\d{1,3})[.)]\s+(.+)$/;
const MAX_TITLE = 120;

interface Start {
  line: number;
  id: string | null;
  /** What follows the ID or number on the starting line. */
  rest: string;
  heading: boolean;
}

/** Text without Markdown emphasis or repeated spaces. */
function clean(text: string): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingOf(line: string): { level: number; text: string } | null {
  const match = HEADING.exec(line.trim());
  return match ? { level: (match[1] ?? "").length, text: clean(match[2] ?? "") } : null;
}

/** "r-01" → "R-01": an ID's letters in capitals, any suffix letter kept. */
function normaliseId(id: string): string {
  return id.replace(/^[A-Za-z]+/, (letters) => letters.toUpperCase());
}

function shorten(text: string): string {
  const plain = text.replace(/[.\s]+$/, "");
  return plain.length > MAX_TITLE ? `${plain.slice(0, MAX_TITLE - 1).trimEnd()}…` : plain;
}

/** Words that make a sentence a rule rather than a label: "must", "may not", "shall". */
const RULE_WORDS =
  /\b(must|may|shall|should|will|can|cannot|can't|not|never|need|needs|required)\b/i;
const MAX_LABEL_WORDS = 8;

/**
 * "Title. The rule text." → a title and a text. The first sentence is a title only when it is a
 * short label; when it already states the rule, the text keeps it and the title repeats it.
 */
function splitTitle(rest: string): { title: string; text: string } {
  const dot = rest.indexOf(". ");
  if (dot <= 0) return { title: shorten(rest), text: rest };
  const first = rest.slice(0, dot);
  const label = first.split(/\s+/).length <= MAX_LABEL_WORDS && !RULE_WORDS.test(first);
  return { title: shorten(first), text: label ? rest.slice(dot + 2).trim() : rest };
}

/** The starts whose IDs share the most common prefix ("R" in "R-01"); the first group on a tie. */
function largestPrefixGroup(starts: readonly Start[]): Start[] {
  const groups = new Map<string, Start[]>();
  for (const start of starts) {
    const prefix = (start.id ?? "").split("-")[0]?.toUpperCase() ?? "";
    groups.set(prefix, [...(groups.get(prefix) ?? []), start]);
  }
  return [...groups.values()].reduce<Start[]>(
    (best, group) => (group.length > best.length ? group : best),
    [],
  );
}

function startsOf(lines: readonly string[]): Start[] {
  const headings = lines.flatMap((line, index) => {
    const heading = headingOf(line);
    if (!heading) return [];
    const match = RULE_ID.exec(heading.text);
    const start: Start = {
      line: index,
      id: match ? (match[1] ?? null) : null,
      rest: match ? clean(match[2] ?? "") : heading.text,
      heading: true,
    };
    return [{ level: heading.level, start }];
  });
  const levels = [...new Set(headings.map((heading) => heading.level))];
  const at = (level: number) =>
    headings.filter((heading) => heading.level === level).map((heading) => heading.start);
  const withId = (level: number) => at(level).filter((start) => start.id);
  // Headings that carry rule IDs, at the level with the most of them (at least two):
  // "## R-01 Approval of large allowance changes". Sections without IDs stay text.
  const idLevel = levels
    .filter((level) => withId(level).length >= 2)
    .sort((a, b) => withId(b).length - withId(a).length || b - a)[0];
  if (idLevel !== undefined) return withId(idLevel);
  // Lines that start with a rule ID: "R-01 Allowance approval limit. Allowance changes above …".
  // At least two must share a prefix, so a sentence starting "Covid-19" or "Grade-10" isn't one.
  const idLines = lines.flatMap((line, index) => {
    const match = headingOf(line) ? null : RULE_ID.exec(line.trim());
    return match
      ? [{ line: index, id: match[1] ?? null, rest: clean(match[2] ?? ""), heading: false }]
      : [];
  });
  const group = largestPrefixGroup(idLines);
  if (group.length >= 2) return group;
  // Every heading at the level used most (at least twice); the deeper level on a tie.
  const level = levels
    .filter((candidate) => at(candidate).length >= 2)
    .sort((a, b) => at(b).length - at(a).length || b - a)[0];
  if (level !== undefined) return at(level);
  // Headings with IDs and nothing else to cut on, such as a policy of one rule.
  const idHeadings = headings.map((heading) => heading.start).filter((start) => start.id);
  if (idHeadings.length > 0) return idHeadings;
  // A numbered list at the very start of lines: "1. Requesters must not approve …".
  const numbered = lines.flatMap((line, index) => {
    const match = /^\d/.test(line) ? NUMBERED.exec(line.trim()) : null;
    return match
      ? [
          {
            line: index,
            id: `R-${(match[1] ?? "").padStart(2, "0")}`,
            rest: clean(match[2] ?? ""),
            heading: false,
          },
        ]
      : [];
  });
  return numbered.length >= 2 ? numbered : [];
}

/** A line's text, with a heading's marks removed. */
function textOf(line: string): string {
  return headingOf(line)?.text ?? clean(line);
}

/**
 * A policy document cut into rules: one per heading or numbered item, keeping the policy's own
 * rule IDs. Repeated IDs get a suffix letter, and anything odd is reported as a warning.
 */
export function splitPolicy(source: string): PolicySplit {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const starts = startsOf(lines);
  const warnings: PolicyWarning[] = [];
  if (starts.length === 0) {
    // Nothing to cut on: the whole document becomes one rule for the admin to check.
    warnings.push({ code: "no_structure", id: null, renamedTo: null });
    const text = lines.map(textOf).filter(Boolean).join("\n");
    if (!text) return { rules: [], warnings };
    const heading = lines.map(headingOf).find((item) => item !== null);
    const title = heading?.text ?? splitTitle(text.split("\n")[0] ?? "").title;
    return { rules: [{ id: "R-01", title: shorten(title), text }], warnings };
  }
  const taken = new Set(starts.flatMap((start) => (start.id ? [normaliseId(start.id)] : [])));
  let next = 1;
  const freeId = () => {
    let id = `R-${String(next).padStart(2, "0")}`;
    while (taken.has(id)) {
      next += 1;
      id = `R-${String(next).padStart(2, "0")}`;
    }
    taken.add(id);
    return id;
  };
  const used = new Set<string>();
  const rules = starts.map((start, index): PolicyRule => {
    const end = starts[index + 1]?.line ?? lines.length;
    const body = lines
      .slice(start.line + 1, end)
      .map(textOf)
      .filter(Boolean)
      .join("\n");
    const oneLine = !body && !start.heading ? splitTitle(start.rest) : null;
    let title = oneLine?.title ?? start.rest;
    let text = oneLine?.text ?? body;
    let id = start.id ? normaliseId(start.id) : freeId();
    if (used.has(id)) {
      const repeated = id;
      const letter = [..."bcdefghijklmnopqrstuvwxyz"].find(
        (candidate) =>
          !used.has(`${repeated}${candidate}`) && !taken.has(`${repeated}${candidate}`),
      );
      id = `${repeated}${letter ?? "z"}`;
      warnings.push({ code: "duplicate_id", id: repeated, renamedTo: id });
    }
    used.add(id);
    taken.add(id);
    if (!text) {
      // A heading with nothing under it: the admin sees the warning and a draft that failed.
      warnings.push({ code: "empty_rule", id, renamedTo: null });
      text = title || id;
    }
    if (!title) title = splitTitle(text).title;
    return { id, title: shorten(title), text };
  });
  return { rules, warnings };
}
