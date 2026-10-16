import { describe, expect, it } from "vitest";
import { routingRequest } from "./routing.service.js";

describe("what AI is asked about owner teams", () => {
  it("leaves out types and teams too long to send, and names each team once", () => {
    expect(
      routingRequest(
        ["pay_change", "x".repeat(65)],
        ["Payroll Operations", "payroll operations", "y".repeat(81)],
      ),
    ).toEqual({ types: ["pay_change"], teams: ["Payroll Operations"] });
  });

  it("asks nothing when no type can be sent", () => {
    expect(routingRequest(["x".repeat(65)], ["Payroll Operations"])).toBeNull();
  });
});
