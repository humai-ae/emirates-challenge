import { describe, expect, it } from "vitest";
import { pseudonymsFor } from "./pseudonyms.js";

describe("tokens for people", () => {
  it("swaps IDs for tokens and back, longest first, never inside a longer ID", () => {
    const people = pseudonymsFor(["E-11", "E-1182", null, "E-11"]);
    expect(people.tokens).toEqual(["[EMP_1]", "[EMP_2]"]);
    const hidden = people.hide("E-1182 was approved by E-11; XE-11 and E-110 are other codes.");
    expect(hidden).toBe("[EMP_2] was approved by [EMP_1]; XE-11 and E-110 are other codes.");
    expect(people.show(hidden)).toBe(
      "E-1182 was approved by E-11; XE-11 and E-110 are other codes.",
    );
  });

  it("leaves text alone when there are no people, and unknown tokens as they are", () => {
    const none = pseudonymsFor([]);
    expect(none.hide("TX-000006 broke R-01.")).toBe("TX-000006 broke R-01.");
    expect(pseudonymsFor(["E-7"]).show("[EMP_9] and [EMP_1]")).toBe("[EMP_9] and E-7");
  });
});
