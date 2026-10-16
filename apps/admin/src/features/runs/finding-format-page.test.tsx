import type { ApiClient, FindingFormat, FindingFormatResponse } from "@hrcc/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { FindingFormatPage } from "./finding-format-page";

const FORMAT: FindingFormat = {
  id: "7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
  filename: "finding_format.csv",
  columns: ["finding_id", "transaction_id", "rule_id", "severity", "notes"],
  examples: [["F-0001", "TX009143", "R01", "Medium", "Checked"]],
  mapping: ["finding_id", "transaction_id", "rule_id", "severity", null],
  values: {
    severity: "title",
    findingIdPrefix: "F-",
    findingIdWidth: 4,
    dateFormat: null,
    status: "OPEN",
  },
  confirmedAt: null,
  confirmedBy: null,
  rowVersion: 1,
  uploadedAt: "2026-10-16T08:00:00.000Z",
  uploadedBy: "Layla Haddad",
};

function makeApi(current: FindingFormatResponse, overrides: Record<string, unknown> = {}) {
  return {
    getFindingFormat: vi.fn().mockResolvedValue(current),
    uploadFindingFormat: vi.fn().mockResolvedValue({ format: FORMAT }),
    confirmFindingMapping: vi.fn().mockResolvedValue({
      format: {
        ...FORMAT,
        confirmedAt: "2026-10-16T08:05:00.000Z",
        confirmedBy: "Layla Haddad",
        rowVersion: 2,
      },
    }),
    ...overrides,
  } as unknown as ApiClient;
}

describe("FindingFormatPage", () => {
  it("uploads a format and shows the mapping it proposes", async () => {
    const user = userEvent.setup();
    const api = makeApi({ format: null });
    renderInRouter(<FindingFormatPage api={api} />);
    await user.upload(
      await screen.findByLabelText("Finding format"),
      new File(["finding_id,transaction_id\n"], "finding_format.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Upload format" }));
    await waitFor(() => expect(api.uploadFindingFormat).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.uploadFindingFormat).mock.calls[0]?.[0];
    expect(body?.get("format")).toBeInstanceOf(File);
    const rows = await screen.findAllByTestId("format-column");
    expect(rows).toHaveLength(5);
    expect(within(rows[1] as HTMLElement).getByText("TX009143")).toBeInTheDocument();
    expect(screen.getByLabelText("Field for transaction_id")).toHaveValue("transaction_id");
    expect(screen.getByLabelText("Field for notes")).toHaveValue("");
    expect(screen.getByText("Check the mapping, then confirm it.")).toBeInTheDocument();
  });

  it("confirms the mapping the admin settles on", async () => {
    const user = userEvent.setup();
    const api = makeApi({ format: FORMAT });
    renderInRouter(<FindingFormatPage api={api} />);
    await user.selectOptions(await screen.findByLabelText("Field for notes"), "description");
    await user.click(screen.getByRole("button", { name: "Confirm mapping" }));
    await waitFor(() =>
      expect(api.confirmFindingMapping).toHaveBeenCalledWith(FORMAT.id, {
        rowVersion: 1,
        mapping: ["finding_id", "transaction_id", "rule_id", "severity", "description"],
      }),
    );
    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
  });

  it("says what to fix in a mapping that can't be scored", async () => {
    const user = userEvent.setup();
    const api = makeApi({ format: FORMAT });
    renderInRouter(<FindingFormatPage api={api} />);
    await user.selectOptions(await screen.findByLabelText("Field for rule_id"), "");
    await user.click(screen.getByRole("button", { name: "Confirm mapping" }));
    expect(
      await screen.findByText("Choose the columns for Transaction ID and Rule ID."),
    ).toBeInTheDocument();
    expect(api.confirmFindingMapping).not.toHaveBeenCalled();
  });
});
