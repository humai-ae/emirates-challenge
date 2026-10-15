import { describe, expect, it } from "vitest";
import { readCsv } from "./csv.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readCsv", () => {
  it("reads a comma file with a BOM and CRLF line ends", () => {
    expect(readCsv(bytes("\uFEFFtransaction_id,amount\r\nTX-1,100\r\nTX-2,250\r\n"))).toEqual({
      ok: true,
      table: {
        header: ["transaction_id", "amount"],
        rows: [
          ["TX-1", "100"],
          ["TX-2", "250"],
        ],
        delimiter: ",",
        widthMismatches: [],
        renamedHeaders: [],
      },
    });
  });

  it("detects a semicolon delimiter and keeps commas inside quotes", () => {
    const result = readCsv(bytes('id;justification\nTX-1;"Market rate, retention"\n'));
    if (!result.ok) throw new Error("expected a table");
    expect(result.table.delimiter).toBe(";");
    expect(result.table.rows).toEqual([["TX-1", "Market rate, retention"]]);
  });

  it("refuses a file that is not UTF-8", () => {
    // "id\ncafé\n" saved as Latin-1.
    expect(readCsv(new Uint8Array([0x69, 0x64, 0x0a, 0x63, 0x61, 0x66, 0xe9, 0x0a]))).toEqual({
      ok: false,
      reason: "not_utf8",
    });
  });

  it("refuses an empty file and a malformed one", () => {
    expect(readCsv(bytes("  \n"))).toEqual({ ok: false, reason: "empty" });
    expect(readCsv(bytes('id,note\nTX-1,"unclosed\n'))).toEqual({ ok: false, reason: "malformed" });
    // A NUL character means binary content, which no text column (or jsonb) can hold.
    expect(readCsv(bytes("id,note\nTX-1,a\u0000b\n"))).toEqual({ ok: false, reason: "malformed" });
  });

  it("evens out short and long rows and records which ones they were", () => {
    const result = readCsv(bytes("a,b,c\n1,2\n1,2,3,4\n1,2,3\n"));
    if (!result.ok) throw new Error("expected a table");
    expect(result.table.rows).toEqual([
      ["1", "2", ""],
      ["1", "2", "3"],
      ["1", "2", "3"],
    ]);
    expect(result.table.widthMismatches).toEqual([1, 2]);
  });

  it("names blank headers and makes duplicate ones unique", () => {
    const result = readCsv(bytes("id,,amount,Amount\n1,x,2,3\n"));
    if (!result.ok) throw new Error("expected a table");
    expect(result.table.header).toEqual(["id", "column_2", "amount", "Amount_2"]);
    expect(result.table.renamedHeaders).toEqual(["column_2", "Amount_2"]);
  });
});
