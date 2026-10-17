import { describe, expect, it } from "vitest";
import { amountBand, judge, normaliseText } from "./judgments.js";

const answers = (accept: number, placeholder = 0, enough = 0.9) => ({
  specific: 1 - accept,
  placeholder,
  accept,
  enough,
});

describe("judging a text", () => {
  it("decides at each threshold", () => {
    expect(judge(answers(0.1))).toEqual({ decision: "breaks", pBreak: 0.9, confidence: "High" });
    expect(judge(answers(0.11)).confidence).toBe("Medium");
    expect(judge(answers(0.3)).decision).toBe("breaks");
    expect(judge(answers(0.31))).toMatchObject({ decision: "unsure", confidence: "Low" });
    expect(judge(answers(0.6)).decision).toBe("unsure");
    expect(judge(answers(0.61))).toMatchObject({ decision: "does_not_break", confidence: null });
  });

  it("counts a placeholder as breaking even when a reviewer might accept it", () => {
    expect(judge(answers(0.8, 0.92))).toMatchObject({ decision: "breaks", pBreak: 0.92 });
  });

  it("can't decide without enough information", () => {
    expect(judge(answers(0.05, 0, 0.29)).decision).toBe("could_not_check");
    expect(judge(answers(0.05, 0, 0.3)).decision).toBe("breaks");
  });

  it("judges a text once however it is spaced or capitalised", () => {
    expect(normaliseText("  As   Discussed\n")).toBe("as discussed");
    expect(normaliseText("Ａｓ discussed")).toBe("as discussed");
  });

  it("gives an amount as a range, so AI sees its size and not the figure", () => {
    expect(amountBand(16_200)).toBe("10,000 to 50,000");
    expect(amountBand(999)).toBe("under 1,000");
    expect(amountBand(100_000)).toBe("over 100,000");
    expect(amountBand(null)).toBeNull();
    expect(amountBand(Number.NaN)).toBeNull();
  });
});
