import { describe, expect, it } from "vitest";
import { readPairs, writePairs } from "./pairs.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readPairs", () => {
  it("finds the transaction and rule columns in any order and spelling", () => {
    const csv =
      "finding_id,Rule ID,severity,Transaction ID\nF-1,R-01,High,TX-1\nF-2,R-02,High,TX-2\n";
    expect(readPairs(bytes(csv), "findings")).toEqual([
      { transactionId: "TX-1", ruleId: "R-01" },
      { transactionId: "TX-2", ruleId: "R-02" },
    ]);
  });

  it("explains a file it can't use", () => {
    expect(() => readPairs(bytes("a,b\n1,2\n"), "findings")).toThrow(
      "findings: needs transaction_id and rule_id columns",
    );
    expect(() => readPairs(new Uint8Array([0xff, 0xfe, 0x00]), "answer key")).toThrow(
      "answer key: not a UTF-8 CSV file",
    );
  });

  it("writes pairs back as a findings file", () => {
    const pairs = [{ transactionId: "TX-1", ruleId: "R-01" }];
    expect(writePairs(pairs)).toBe("transaction_id,rule_id\nTX-1,R-01\n");
    expect(readPairs(bytes(writePairs(pairs)), "findings")).toEqual(pairs);
  });
});
