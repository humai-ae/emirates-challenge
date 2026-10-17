import type { Locale, PatternDetector, PatternFact } from "@hrcc/shared";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Texts = Readonly<Record<PatternDetector, Readonly<Record<Locale, string>>>>;

/** What each pattern is called. */
const TITLES: Texts = {
  just_under_limit: { en: "Amounts just under a limit", ar: "مبالغ تقل قليلًا عن حدّ" },
  dominant_pair: {
    en: "One approver outside the reporting line",
    ar: "معتمِد واحد من خارج التسلسل الإداري",
  },
  off_hours_approvals: { en: "Off-hours approvals", ar: "اعتمادات خارج ساعات العمل" },
  backdating: {
    en: "Backdating beyond the team's norm",
    ar: "تأخر في التقديم يتجاوز المعتاد للفريق",
  },
  rare_type: { en: "A rare transaction type", ar: "نوع معاملة نادر" },
  split_requests: { en: "Split requests", ar: "طلبات مجزّأة" },
};

/** What each pattern looks for. */
const DESCRIPTIONS: Texts = {
  just_under_limit: {
    en: "Amounts just under an approval limit, made by the same requester far more often than by others.",
    ar: "مبالغ تقل قليلًا عن حدّ الاعتماد، يقدّمها مقدِّم الطلب نفسه أكثر بكثير من غيره.",
  },
  dominant_pair: {
    en: "One approver, outside the requester's reporting line, on almost all of a requester's transactions.",
    ar: "معتمِد واحد، من خارج التسلسل الإداري لمقدِّم الطلب، على كل معاملات مقدِّم الطلب تقريبًا.",
  },
  off_hours_approvals: {
    en: "A team that approves outside working hours or on non-working days far more often than everyone else.",
    ar: "فريق يعتمد خارج ساعات العمل أو في أيام العطلة أكثر بكثير من الجميع.",
  },
  backdating: {
    en: "A transaction submitted long after it took effect, far beyond its team's usual gap.",
    ar: "معاملة قُدّمت بعد مدة طويلة من سريانها، تتجاوز بكثير الفارق المعتاد لفريقها.",
  },
  rare_type: {
    en: "A transaction type that is rare for the employee's department.",
    ar: "نوع معاملة نادر في قسم الموظف.",
  },
  split_requests: {
    en: "An employee's transactions within a few days that each stay under a limit but together go over it.",
    ar: "معاملات لموظف خلال أيام قليلة، كل منها دون الحدّ لكن مجموعها يتجاوزه.",
  },
};

/**
 * The standard explanation, from the facts only. The Arabic states counts as labelled facts, so no
 * number has to agree with a noun.
 */
const EXPLANATIONS: Texts = {
  just_under_limit: {
    en: "{requester} made {near_limit} of their {of} requests under {rule} at 90–100% of its {limit} limit: {share_pct}%, against {everyone_pct}% for everyone.",
    ar: "قدّم {requester} طلبات بموجب {rule} بمبالغ بين 90% و100% من حدّها البالغ {limit}: {near_limit} من أصل {of} ({share_pct}%، مقابل {everyone_pct}% للجميع).",
  },
  dominant_pair: {
    en: "{approver} approved {approved} of the {of} transactions {requester} requested ({share_pct}%), and isn't in {requester}'s reporting line.",
    ar: "اعتمد {approver} من المعاملات التي قدّمها {requester}: {approved} من أصل {of} ({share_pct}%)، وليس ضمن التسلسل الإداري لـ{requester}.",
  },
  off_hours_approvals: {
    en: "{department} approved {off_hours} of its {of} approvals outside working hours or on non-working days: {team_pct}%, against {everyone_pct}% for everyone.",
    ar: "اعتمادات قسم {department} خارج ساعات العمل أو في أيام العطلة: {off_hours} من أصل {of} ({team_pct}%، مقابل {everyone_pct}% للجميع).",
  },
  backdating: {
    en: "Transaction {transaction} in {department} was submitted {days_late} days after it took effect; the team's usual gap is {team_median_days} days.",
    ar: "قُدّمت المعاملة {transaction} في قسم {department} بعد سريانها، والأيام بينهما: {days_late}، بينما الفارق المعتاد للفريق بالأيام: {team_median_days}.",
  },
  rare_type: {
    en: "Only {count} of the {of} transactions in {department} are {type} ({share_pct}%); transaction {transaction} is one of them.",
    ar: "معاملات النوع {type} في قسم {department}: {count} من أصل {of} ({share_pct}%)، والمعاملة {transaction} إحداها.",
  },
  split_requests: {
    en: "{employee} had {count} transactions under {rule} within {window_days} days, each at or under its {limit} limit but {total} together (the largest {largest}).",
    ar: "معاملات {employee} بموجب {rule} خلال مدة أيامها {window_days}: {count}، كل منها لا يتجاوز الحدّ البالغ {limit} لكن مجموعها {total} (أكبرها {largest}).",
  },
};

/** Backdating, worded for a team that usually submits before the effective date. */
const BACKDATING_EARLY_TEAM: Readonly<Record<Locale, string>> = {
  en: "Transaction {transaction} in {department} was submitted {days_late} days after it took effect; the team usually submits {team_lead_days} days before.",
  ar: "قُدّمت المعاملة {transaction} في قسم {department} بعد سريانها، والأيام بينهما: {days_late}، بينما يقدّم الفريق عادةً قبل السريان بأيام عددها: {team_lead_days}.",
};

/** What a person could look into: never a judgment of anyone. */
const FOLLOW_UPS: Texts = {
  just_under_limit: {
    en: "Look into why these amounts sit just under the limit, and whether a higher approval was needed.",
    ar: "تحقّق من سبب وقوع هذه المبالغ دون الحدّ مباشرة، ومن الحاجة إلى اعتماد أعلى.",
  },
  dominant_pair: {
    en: "Check why this approver handles almost all of these requests, and whether approvals should follow the reporting line.",
    ar: "تحقّق من سبب تولّي هذا المعتمِد كل هذه الطلبات تقريبًا، ومن وجوب أن تتبع الاعتمادات التسلسل الإداري.",
  },
  off_hours_approvals: {
    en: "Check whether these off-hours approvals were expected, and that each one was properly reviewed.",
    ar: "تحقّق من أن هذه الاعتمادات خارج ساعات العمل كانت متوقعة، وأن كلًّا منها رُوجع كما يجب.",
  },
  backdating: {
    en: "Check why this transaction was submitted so long after it took effect.",
    ar: "تحقّق من سبب تقديم هذه المعاملة بعد مدة طويلة من سريانها.",
  },
  rare_type: {
    en: "Check that this transaction type is right for this department.",
    ar: "تحقّق من أن نوع المعاملة هذا مناسب لهذا القسم.",
  },
  split_requests: {
    en: "Check whether these transactions belong together, and whether they needed the approval their total calls for.",
    ar: "تحقّق مما إذا كانت هذه المعاملات مرتبطة ببعضها، ومن حاجتها إلى الاعتماد الذي يتطلبه مجموعها.",
  },
};

const formatted = (value: string | number) =>
  typeof value === "number" ? NUMBER.format(value) : value;

/** A pattern's standard explanation; a fact the pattern lacks shows as a dash. */
export function explainPattern(
  pattern: { detector: PatternDetector; facts: readonly PatternFact[] },
  locale: Locale,
): string {
  const facts = new Map(pattern.facts.map((fact) => [fact.key, formatted(fact.value)]));
  let template = EXPLANATIONS[pattern.detector][locale];
  const usual = pattern.facts.find((fact) => fact.key === "team_median_days")?.value;
  if (pattern.detector === "backdating" && typeof usual === "number" && usual < 0) {
    template = BACKDATING_EARLY_TEAM[locale];
    facts.set("team_lead_days", formatted(-usual));
  }
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => facts.get(key) ?? "—");
}

export const patternTitle = (detector: PatternDetector, locale: Locale) => TITLES[detector][locale];

export const patternDescription = (detector: PatternDetector, locale: Locale) =>
  DESCRIPTIONS[detector][locale];

export const patternFollowUp = (detector: PatternDetector, locale: Locale) =>
  FOLLOW_UPS[detector][locale];
