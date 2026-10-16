import type { ApiClient } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { flagSummary } from "../../test/flags";
import { renderInRouter } from "../../test/render";
import { FixChecksPage } from "./fix-checks-page";

describe("FixChecksPage", () => {
  it("lists the fixes waiting for a check, with what the team did", async () => {
    const api = {
      getFixChecks: vi.fn().mockResolvedValue({
        flags: [
          flagSummary({
            status: "fix_submitted",
            assignee: "Priya Nair",
            fix: {
              type: "document_added",
              note: "Clearance form attached.",
              by: "Priya Nair",
              byId: "u-priya",
              at: "2026-10-17T09:00:00.000Z",
            },
          }),
        ],
      }),
    } as unknown as ApiClient;
    renderInRouter(<FixChecksPage api={api} />);
    const row = await screen.findByTestId("flag-row");
    expect(row).toHaveTextContent(
      "Fixed by Priya Nair: Missing document added · Clearance form attached.",
    );
    expect(screen.getByRole("link", { name: /R-01/ })).toHaveAttribute(
      "href",
      "/analyst/flags/F-000001",
    );
  });

  it("says when nothing is waiting", async () => {
    const api = { getFixChecks: vi.fn().mockResolvedValue({ flags: [] }) } as unknown as ApiClient;
    renderInRouter(<FixChecksPage api={api} />);
    expect(await screen.findByText("Nothing to close")).toBeInTheDocument();
  });
});
