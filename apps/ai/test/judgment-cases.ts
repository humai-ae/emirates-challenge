/** A judgment rule from the synthetic policy, and justifications to judge against it. */
export const JUDGMENT_RULE =
  "Justifications for pay changes above AED 5,000 must give a clear business reason.";

/** Synthetic texts, labelled: `breaks` when the text gives no clear business reason. */
export const JUDGMENT_CASES: ReadonlyArray<{ text: string; breaks: boolean }> = [
  { text: "Annual performance review", breaks: false },
  { text: "Market rate adjustment", breaks: false },
  { text: "Retention after external offer", breaks: false },
  { text: "Additional responsibilities", breaks: false },
  { text: "Peak season cover", breaks: false },
  { text: "Role scope increased", breaks: false },
  { text: "Housing cost review", breaks: false },
  { text: "Project delivery bonus", breaks: false },
  { text: "Promoted to team lead after the restructuring", breaks: false },
  { text: "Matched the offer from a competitor to keep a key engineer", breaks: false },
  { text: "Took over the duties of a departing supervisor", breaks: false },
  { text: "Salary brought in line with the grade's market benchmark", breaks: false },
  { text: "Relocated to the Abu Dhabi office", breaks: false },
  { text: "Completed the certification the role requires", breaks: false },
  { text: "Covering night shifts for the season", breaks: false },
  { text: "as discussed", breaks: true },
  { text: "see email", breaks: true },
  { text: "N/A", breaks: true },
  { text: "approved", breaks: true },
  { text: "-", breaks: true },
  { text: "per manager", breaks: true },
  { text: "ok", breaks: true },
  { text: "adjustment", breaks: true },
  { text: "as agreed", breaks: true },
  { text: "TBD", breaks: true },
  { text: "change", breaks: true },
  { text: "requested", breaks: true },
  { text: "pls approve", breaks: true },
  { text: "same as before", breaks: true },
  { text: "x", breaks: true },
];
