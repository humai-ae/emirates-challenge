/** Arabic-Indic and extended Arabic-Indic digits, as Latin ones. */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** The numbers in a text as plain digits: thousands separators dropped, any script's digits read. */
export function numbersIn(text: string): string[] {
  return [...latinDigits(text).matchAll(/\d+(?:[.,٫٬]\d+)*/g)].map((match) =>
    match[0].replace(/[,٬]/g, "").replace("٫", "."),
  );
}

/** Numbers in `text` that no source contains: a written text may only repeat the facts it was given. */
export function unsupportedNumbers(text: string, sources: readonly string[]): string[] {
  const known = new Set(sources.flatMap(numbersIn));
  return [...new Set(numbersIn(text).filter((number) => !known.has(number)))];
}

const FIELD_NAME = /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g;
const TOKEN = /\[EMP_\d{1,3}\]/g;

/** Words that look like column names (they have an underscore, like approver_1_id). */
export function fieldNamesIn(text: string): string[] {
  return [...new Set(text.match(FIELD_NAME) ?? [])];
}

/** Column names in a written text that the given ones don't include (case aside). */
export function unknownFields(text: string, known: readonly string[]): string[] {
  const names = new Set(known.map((name) => name.toLowerCase()));
  return fieldNamesIn(text).filter((name) => !names.has(name.toLowerCase()));
}

/** People's tokens in a written text that the request didn't contain. */
export function unknownTokens(text: string, tokens: readonly string[]): string[] {
  const known = new Set(tokens);
  return [...new Set(text.match(TOKEN) ?? [])].filter((token) => !known.has(token));
}
