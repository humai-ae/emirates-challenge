import {
  type AiDraftDecisions,
  type AiDraftRuleRequest,
  APPROVER_CHOICES,
  COMPARISON_OPERATORS,
  NONE_FITS,
  NUMBER_COLUMN_TYPES,
  PRESET_IDS,
  type PresetId,
  REACH_CHOICES,
  type Severity,
  TEXT_COLUMN_TYPES,
} from "@hrcc/shared";
import {
  type ChoiceResponse,
  choice,
  type NoulResponse,
  noul,
  type Question,
  type Questions,
  type ResultFor,
  score,
} from "@typesafe-ai/sdk";
import { PRESET_DESCRIPTIONS } from "./presets.js";

export const QUESTION_SET = "rule-draft-v2";
export const NOT_STATED = "not_stated";

/** Severity levels in the order the score question lists them. */
const SEVERITY_LEVELS: readonly Severity[] = ["Low", "Medium", "High"];
const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const PERSONS = ["employee", "requester"] as const;

type Answers = Readonly<Record<string, ResultFor<Question> | undefined>>;
/** A value question's options, by the label Jev sees. */
type Labels = ReadonlyMap<string, string | number>;

export interface DraftQuestions {
  state: { rule: string; columns: string[]; transaction_types: string[]; document_types: string[] };
  questions: Questions;
  /** The options of each value question asked; an empty map means it wasn't asked. */
  labels: Readonly<Record<string, Labels>>;
}

function presetQuestion(order: readonly PresetId[]) {
  return choice(
    "Which check tests what this rule requires? Read the rule's own words and pick the check that tests exactly that condition.",
    {
      ...Object.fromEntries(order.map((preset) => [preset, { ...PRESET_DESCRIPTIONS[preset] }])),
      [NONE_FITS]: "None of these checks tests what the rule requires.",
    },
  );
}

/**
 * One request's questions: the check type twice (the options reversed the second time, as Jev
 * leans to the first), a Choice for each value over the numbers and columns code found, a Noul per
 * transaction type and per document, and a Score for severity. Values with nothing to offer aren't
 * asked.
 */
export function draftQuestions(request: AiDraftRuleRequest): DraftQuestions {
  const { candidates, columns, vocabulary } = request;
  const columnsOf = (types: readonly string[]) =>
    new Map(
      columns
        .filter((column) => types.includes(column.type))
        .map((column) => [column.name, column.name]),
    );
  const labels: Record<string, Labels> = {
    amount: new Map(candidates.amounts.map((value) => [GROUPED.format(value), value])),
    grade: new Map(candidates.grades.map((value) => [`Grade ${value}`, value])),
    days: new Map(candidates.days.map((value) => [`${value} days`, value])),
    count: new Map(candidates.counts.map((value) => [String(value), value])),
    number_field: columnsOf(NUMBER_COLUMN_TYPES),
    text_field: columnsOf(TEXT_COLUMN_TYPES),
    any_field: new Map(columns.map((column) => [column.name, column.name])),
  };
  const questions: Questions = {
    preset_a: presetQuestion(PRESET_IDS),
    preset_b: presetQuestion([...PRESET_IDS].reverse()),
    every_type: noul(
      "Does the rule apply to every transaction type, rather than only to some types?",
    ),
    same_amount: noul(
      "Does the rule count transactions as duplicates only when their amounts are the same?",
    ),
    requester_too: noul(
      "Does the rule also forbid the employee the transaction is about from being the person who requested it?",
    ),
    severity: score(
      "How serious is a breach of this rule? If the rule states its severity, use that.",
      [
        "Low: a minor process slip with little risk",
        "Medium: a control gap that should be fixed",
        "High: a serious breach, such as a missing key approval, money at risk or fraud risk",
      ],
    ),
    operator: choice("Does the rule flag values above its limit, or below it?", {
      ">": "Above the limit: more than it",
      ">=": "At or above the limit",
      "<": "Below the limit: less than it",
      "<=": "At or below the limit",
      "==": "Exactly the limit",
      "!=": "Anything but the limit",
    }),
    per: choice("Whose transactions does the rule count?", {
      employee: "The employee the transactions are about",
      requester: "The person who requested them",
    }),
    approver: choice(
      "Which approver does the rule say must be the employee's manager, or someone above them?",
      {
        first: "The first approver listed",
        any: "Any one of the approvers",
      },
    ),
    reach: choice("Who counts as the employee's manager under this rule?", {
      line_manager: "Only the employee's direct line manager",
      reporting_line: "The line manager or anyone above them in the reporting line",
    }),
  };
  const ask = (id: string, instructions: string, notStated: string) => {
    const options = labels[id];
    if (!options || options.size === 0) return;
    questions[id] = choice(instructions, {
      ...Object.fromEntries([...options.keys()].map((label) => [label, null])),
      [NOT_STATED]: notStated,
    });
  };
  ask(
    "amount",
    "Which amount is the limit or threshold this rule sets?",
    "The rule names no amount.",
  );
  ask(
    "grade",
    "Which grade is the lowest an approver may have under this rule?",
    "The rule names no approver grade.",
  );
  ask(
    "days",
    "Which number of days is the time limit or period this rule sets?",
    "The rule names no number of days.",
  );
  ask(
    "count",
    "What is the largest number of these transactions the rule allows in its period?",
    "The rule names no number of transactions.",
  );
  ask(
    "number_field",
    "Which column holds the number the rule compares with its limit?",
    "None of these columns.",
  );
  ask(
    "text_field",
    "Which column holds the written reason or justification the rule is about?",
    "None of these columns.",
  );
  ask("any_field", "Which column must be filled in under this rule?", "None of these columns.");
  vocabulary.types.forEach((type, index) => {
    questions[`type_${index}`] = noul(`Does the rule apply to transactions of type "${type}"?`);
  });
  vocabulary.documents.forEach((document, index) => {
    questions[`document_${index}`] = noul(
      `Does the rule require a "${document}" document to be attached?`,
    );
  });
  return {
    state: {
      rule: request.text,
      columns: columns.map((column) => column.name),
      transaction_types: vocabulary.types,
      document_types: vocabulary.documents,
    },
    questions,
    labels,
  };
}

function choiceAnswer(answers: Answers, id: string): ChoiceResponse {
  const answer = answers[id];
  if (answer?.type !== "choice") throw new Error(`No choice answer for ${id}`);
  return answer;
}

function noulAnswer(answers: Answers, id: string): NoulResponse {
  const answer = answers[id];
  if (answer?.type !== "noul") throw new Error(`No yes/no answer for ${id}`);
  return answer;
}

/** A value question's pick; one that wasn't asked has nothing to pick. */
function picked<T extends string | number>(answers: Answers, id: string, labels: Labels) {
  if (labels.size === 0) return { value: null, probability: 1 };
  const answer = choiceAnswer(answers, id);
  return {
    value: (labels.get(answer.choice) as T | undefined) ?? null,
    probability: answer.probabilities[answer.choice] ?? answer.confidence,
  };
}

/** A closed choice's pick, kept only when it is one of the allowed values. */
function option<T extends string>(answers: Answers, id: string, allowed: readonly T[]) {
  const answer = choiceAnswer(answers, id);
  const value = allowed.find((item) => item === answer.choice) ?? null;
  return { value, probability: answer.probabilities[answer.choice] ?? answer.confidence };
}

/** Jev's answers as decisions about the rule; an answer missing or of the wrong kind throws. */
export function readDraftAnswers(
  request: AiDraftRuleRequest,
  { labels }: Pick<DraftQuestions, "labels">,
  answers: Answers,
): AiDraftDecisions {
  const none: Labels = new Map();
  const severity = answers.severity;
  if (severity?.type !== "score") throw new Error("No score answer for severity");
  const levels = SEVERITY_LEVELS.map((level, index) => ({
    level,
    probability: (severity.probabilities as Record<string, number>)[String(index)] ?? 0,
  }));
  const likeliest = levels.reduce((best, level) =>
    level.probability > best.probability ? level : best,
  );
  return {
    presets: [
      choiceAnswer(answers, "preset_a").probabilities,
      choiceAnswer(answers, "preset_b").probabilities,
    ],
    amount: picked<number>(answers, "amount", labels.amount ?? none),
    grade: picked<number>(answers, "grade", labels.grade ?? none),
    days: picked<number>(answers, "days", labels.days ?? none),
    count: picked<number>(answers, "count", labels.count ?? none),
    operator: option(answers, "operator", COMPARISON_OPERATORS),
    per: option(answers, "per", PERSONS),
    approver: option(answers, "approver", APPROVER_CHOICES),
    reach: option(answers, "reach", REACH_CHOICES),
    numberField: picked<string>(answers, "number_field", labels.number_field ?? none),
    textField: picked<string>(answers, "text_field", labels.text_field ?? none),
    anyField: picked<string>(answers, "any_field", labels.any_field ?? none),
    everyType: noulAnswer(answers, "every_type").noul,
    sameAmount: noulAnswer(answers, "same_amount").noul,
    requesterToo: noulAnswer(answers, "requester_too").noul,
    types: Object.fromEntries(
      request.vocabulary.types.map((type, index) => [
        type,
        noulAnswer(answers, `type_${index}`).noul,
      ]),
    ),
    documents: Object.fromEntries(
      request.vocabulary.documents.map((document, index) => [
        document,
        noulAnswer(answers, `document_${index}`).noul,
      ]),
    ),
    severity: { value: likeliest.level, probability: likeliest.probability },
  };
}
