import { fieldNamesIn, unknownFields, unknownTokens, unsupportedNumbers } from "@hrcc/engine";
import {
  type AiExplainRequest,
  type AiWritten,
  EXPLANATION_MAX_WORDS,
  FIX_MAX_LENGTH,
} from "@hrcc/shared";

const TOKEN = /\[EMP_\d{1,3}\]/g;
const withoutTokens = (text: string) => text.replace(TOKEN, " ");
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Everything a text may take its facts from. */
export function sourcesOf(request: AiExplainRequest): string[] {
  return [
    request.rule.id,
    request.rule.title,
    request.rule.text,
    request.transactionId ?? "",
    ...request.evidence.flatMap((item) => [
      item.field,
      ...(Array.isArray(item.value) ? item.value : [item.value]),
      item.condition,
    ]),
    request.action.en,
    request.action.ar,
    request.standard.en,
    request.standard.ar,
    request.judgment ? String(request.judgment.likelihood) : "",
  ];
}

/** What is wrong with one language's texts: empty when they only repeat the flag's data. */
export function problemsWith(written: AiWritten, request: AiExplainRequest): string[] {
  const problems: string[] = [];
  if (wordCount(written.explanation) > EXPLANATION_MAX_WORDS) {
    problems.push(`the explanation is longer than ${EXPLANATION_MAX_WORDS} words`);
  }
  if (written.fix.length > FIX_MAX_LENGTH) {
    problems.push(`the fix is longer than ${FIX_MAX_LENGTH} characters`);
  }
  const sources = sourcesOf(request);
  const numberSources = sources.map(withoutTokens);
  const knownFields = sources.flatMap(fieldNamesIn);
  for (const [part, text] of [
    ["explanation", written.explanation],
    ["fix", written.fix],
  ] as const) {
    // Tokens are checked on their own below; their letters and digits aren't fields or facts.
    const bare = withoutTokens(text);
    const fields = unknownFields(bare, knownFields);
    const numbers = unsupportedNumbers(bare, numberSources);
    if (fields.length > 0) {
      const extra = numbers.length > 0 ? `, and numbers: ${numbers.join(", ")}` : "";
      problems.push(`the ${part} names fields the data doesn't: ${fields.join(", ")}${extra}`);
    } else if (numbers.length > 0) {
      problems.push(`the ${part} gives numbers the data doesn't: ${numbers.join(", ")}`);
    }
    const people = unknownTokens(text, request.people);
    if (people.length > 0) {
      problems.push(`the ${part} names people the data doesn't: ${people.join(", ")}`);
    }
  }
  return problems;
}
