import type { AiJudgeRequest, JudgmentAnswers } from "@hrcc/shared";
import { noul, type Questions } from "@typesafe-ai/sdk";

const ASPECTS = ["specific", "placeholder", "accept", "enough"] as const;
type Aspect = (typeof ASPECTS)[number];

const idOf = (index: number, aspect: Aspect) => `t${index}_${aspect}`;

/** Four Nouls per text, and what Jev reads: the rule and each text with its context. */
export interface JudgmentQuestions {
  state: {
    rule: { id: string; text: string };
    items: Array<{
      field: string;
      text: string;
      transaction_type: string | null;
      amount: string | null;
    }>;
  };
  questions: Questions;
}

/** Four Nouls per text, all over the same state, so Jev answers them in parallel. */
export function judgmentQuestions(request: AiJudgeRequest): JudgmentQuestions {
  const questions: Questions = {};
  request.items.forEach((_, index) => {
    const text = `\`items[${index}].text\``;
    questions[idOf(index, "specific")] = noul(
      `Does ${text} give a specific business reason for this HR transaction?`,
      {
        true: "It names a concrete reason, such as a promotion, a market adjustment, added duties or a retention offer.",
        false: "It gives no concrete reason: it is vague, generic or says nothing about why.",
      },
    );
    questions[idOf(index, "placeholder")] = noul(
      `Is ${text} a generic placeholder rather than a real explanation, such as "as discussed", "see email", "N/A", "approved" or "-"?`,
    );
    questions[idOf(index, "accept")] = noul(
      `Would an HR compliance reviewer accept ${text} as meeting the rule in \`rule.text\`?`,
    );
    questions[idOf(index, "enough")] = noul(
      `Is there enough information in \`items[${index}]\` and \`rule.text\` to judge whether the text meets the rule?`,
    );
  });
  return {
    state: {
      rule: { id: request.rule.id, text: request.rule.text },
      items: request.items.map((item) => ({
        field: item.field,
        text: item.text,
        transaction_type: item.type,
        amount: item.amountBand,
      })),
    },
    questions,
  };
}

/** Each text's four probabilities, in item order; throws on an answer that isn't a Noul. */
export function readJudgments(
  request: AiJudgeRequest,
  answers: Readonly<Record<string, { type: string; noul?: number }>>,
): Array<JudgmentAnswers & { key: string }> {
  return request.items.map((item, index) => {
    const probability = (aspect: Aspect): number => {
      const answer = answers[idOf(index, aspect)];
      if (answer?.type !== "noul" || typeof answer.noul !== "number") {
        throw new Error(`No Noul answer for ${idOf(index, aspect)}`);
      }
      return answer.noul;
    };
    return {
      key: item.key,
      specific: probability("specific"),
      placeholder: probability("placeholder"),
      accept: probability("accept"),
      enough: probability("enough"),
    };
  });
}
