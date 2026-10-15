import { PRESET_CATALOGUE, PRESET_IDS } from "@hrcc/shared";
import { describe, expect, it } from "vitest";
import { PRESETS } from "./index.js";

describe("the check-type catalogue", () => {
  it("is where every preset takes its kind and parameters from", () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS.get(id);
      expect(preset?.parameters, id).toBe(PRESET_CATALOGUE[id].parameters);
      expect(preset?.checkKind, id).toBe(PRESET_CATALOGUE[id].checkKind);
    }
  });
});
