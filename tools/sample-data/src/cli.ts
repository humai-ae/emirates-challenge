import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generatePack } from "./generate.ts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    out: { type: "string", default: "../../.context/sample-pack" },
    seed: { type: "string", default: "2025" },
    employees: { type: "string", default: "2000" },
    transactions: { type: "string", default: "10000" },
  },
});

const pack = generatePack({
  seed: Number(values.seed),
  employees: Number(values.employees),
  transactions: Number(values.transactions),
});
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
for (const [name, content] of Object.entries(pack.files)) {
  writeFileSync(join(out, name), content);
}
console.log(
  `Wrote ${Object.keys(pack.files).length} files to ${out} (${pack.answerKey.length} planted rule breaks).`,
);
