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
