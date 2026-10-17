import { describe, expect, it } from "vitest";
import { fieldNamesIn, unknownFields, unknownTokens, unsupportedNumbers } from "./facts.js";

describe("numbers a text may repeat", () => {
  it("accepts a text that repeats the rule's numbers, however they are written", () => {
    const rule = "Allowance changes over AED 3,000 need approval within 30 days.";
    expect(
      unsupportedNumbers("Get approval for changes over AED 3000 within 30 days.", [rule]),
    ).toEqual([]);
    expect(
      unsupportedNumbers("احصل على الاعتماد للتغييرات التي تزيد على ٣٬٠٠٠ درهم.", [rule]),
    ).toEqual([]);
  });

  it("names the numbers the rule doesn't give", () => {
    expect(
      unsupportedNumbers("Approve within 5 days anything over AED 5,000.", [
        "Allowance changes over AED 3,000 need approval.",
      ]),
    ).toEqual(["5", "5000"]);
  });
});

describe("field names and tokens in a written text", () => {
  it("finds field names and tokens the data doesn't have", () => {
    expect(fieldNamesIn("approver_1_id and effective_date, not effective date")).toEqual([
      "approver_1_id",
      "effective_date",
    ]);
    expect(
      unknownFields("The approver_2_grade and Effective_Date are compared.", ["effective_date"]),
    ).toEqual(["approver_2_grade"]);
    expect(unknownTokens("[EMP_1] asked [EMP_3] twice: [EMP_3].", ["[EMP_1]"])).toEqual([
      "[EMP_3]",
    ]);
  });
});
