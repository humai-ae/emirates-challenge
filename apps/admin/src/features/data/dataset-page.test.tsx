import type { ApiClient, DatasetColumn, DatasetDetail } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { DatasetPage } from "./dataset-page";

const ID = "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30";
const column = (overrides: Partial<DatasetColumn>): DatasetColumn => ({
  file: "transactions",
  name: "transaction_id",
  position: 0,
  type: "id",
  role: "transaction_id",
  roleConfident: true,
  roleConfirmed: false,
  blankCount: 0,
  distinctCount: 300,
  invalidCount: 0,
  samples: ["TX-000001", "TX-000002"],
  min: null,
  max: null,
  dateFormat: null,
  dateAmbiguous: false,
  listDelimiter: null,
  ...overrides,
});
const dataset: DatasetDetail = {
  id: ID,
  name: "Training pack",
  status: "ready",
  rejection: null,
  transactionCount: 300,
  employeeCount: 60,
  periodFrom: "2025-01-02",
  periodTo: "2025-12-30",
  issueCount: 2,
  columnsConfirmed: false,
  createdAt: "2026-10-15T09:00:00.000Z",
  createdBy: "Layla Haddad",
  files: [
    {
      kind: "transactions",
      filename: "transactions.csv",
      sizeBytes: 40_210,
      sha256: "ab".repeat(32),
    },
    { kind: "employees", filename: "employees.csv", sizeBytes: 3_120, sha256: "cd".repeat(32) },
  ],
  columns: [
    column({}),
    column({ name: "employee_id", position: 1, role: "employee_id", samples: ["E-0003"] }),
    column({ name: "approver_1_id", position: 2, role: "approver_ids", samples: ["E-0002"] }),
    column({
      name: "Txn Note",
      position: 3,
      type: "text",
      role: "text",
      roleConfident: false,
      samples: ["Annual review"],
    }),
    column({
      file: "employees",
      name: "staff_no",
      position: 0,
      role: "employee_id",
      samples: ["E-0001"],
    }),
  ],
  issues: [
    {
      code: "blank_values",
      file: "transactions",
      column: "approver_1_id",
      role: "approver_ids",
      count: 2,
      examples: ["TX-000007", "TX-000067"],
    },
    {
      code: "unknown_employee",
      file: "transactions",
      column: "approver_1_id",
      role: "approver_ids",
      count: 1,
      examples: ["E-9003"],
    },
  ],
};
const confirmed: DatasetDetail = {
  ...dataset,
  columnsConfirmed: true,
  columns: dataset.columns.map((item) => ({
    ...item,
    roleConfirmed: true,
    role: item.name === "Txn Note" ? null : item.role,
  })),
};
const deleted: DatasetDetail = {
  ...dataset,
  status: "deleted",
  columns: dataset.columns.map((item) => ({ ...item, samples: [] })),
  issues: dataset.issues.map((issue) => ({ ...issue, examples: [] })),
};

function makeApi(detail: DatasetDetail, overrides: Record<string, unknown> = {}) {
  return {
    getDataset: vi.fn().mockResolvedValue({ dataset: detail }),
    confirmDatasetRoles: vi.fn().mockResolvedValue({ dataset: confirmed }),
    deleteDataset: vi.fn().mockResolvedValue({ dataset: deleted }),
    listDatasets: vi.fn().mockResolvedValue({ datasets: [] }),
    ...overrides,
  } as unknown as ApiClient;
}

const roleOf = (name: string) => screen.getByRole("combobox", { name: `Role of ${name}` });

describe("DatasetPage", () => {
  it("shows counts, files, issues and the detected roles", async () => {
    renderInRouter(<DatasetPage api={makeApi(dataset)} datasetId={ID} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Training pack");
    expect(
      screen.getByText("Check the role of each column, then confirm.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 Jan 2025 – 30 Dec 2025")).toBeInTheDocument();
    expect(screen.getAllByTestId("dataset-file")[0]).toHaveTextContent("transactions.csv");
    const issues = screen.getAllByTestId("dataset-issue");
    expect(issues[0]).toHaveTextContent("Blank values in approver_1_id: 2");
    expect(issues[0]).toHaveTextContent("Examples: TX-000007, TX-000067");
    expect(issues[1]).toHaveTextContent("Unknown employee IDs in approver_1_id: 1");
    expect(roleOf("approver_1_id")).toHaveValue("approver_ids");
    expect(roleOf("staff_no")).toHaveValue("employee_id");
    const note = screen.getAllByTestId("dataset-column")[3] as HTMLElement;
    expect(within(note).getByText("Check")).toBeInTheDocument();
  });

  it("confirms the roles as chosen", async () => {
    const api = makeApi(dataset);
    const user = userEvent.setup();
    renderInRouter(<DatasetPage api={api} datasetId={ID} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Role of Txn Note" }), "");
    await user.click(screen.getByRole("button", { name: "Confirm columns" }));
    await vi.waitFor(() =>
      expect(api.confirmDatasetRoles).toHaveBeenCalledWith(ID, {
        transactions: {
          transaction_id: ["transaction_id"],
          employee_id: ["employee_id"],
          approver_ids: ["approver_1_id"],
        },
        employees: { employee_id: ["staff_no"] },
      }),
    );
    expect(
      await screen.findByText("Columns confirmed. Checks will use these roles."),
    ).toBeInTheDocument();
  });

  it("explains why a mapping can't be confirmed", async () => {
    const api = makeApi(dataset);
    const user = userEvent.setup();
    renderInRouter(<DatasetPage api={api} datasetId={ID} />);
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Role of employee_id" }),
      "transaction_id",
    );
    await user.click(screen.getByRole("button", { name: "Confirm columns" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only Approvers can be given to more than one column.",
    );
    expect(api.confirmDatasetRoles).not.toHaveBeenCalled();
  });

  it("explains a rejected dataset", async () => {
    renderInRouter(
      <DatasetPage
        api={makeApi({ ...dataset, status: "rejected", rejection: "no_employee_id" })}
        datasetId={ID}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No column in the employees file looks like an employee ID. Pick it below and confirm.",
    );
  });

  it("deletes the dataset after confirmation", async () => {
    const api = makeApi(dataset);
    const user = userEvent.setup();
    renderInRouter(<DatasetPage api={api} datasetId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Delete dataset" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete Training pack?");
    await user.click(within(dialog).getByRole("button", { name: "Delete dataset" }));
    await vi.waitFor(() => expect(api.deleteDataset).toHaveBeenCalledWith(ID));
    expect(
      await screen.findByText("This dataset was deleted.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a deleted dataset without controls", async () => {
    renderInRouter(<DatasetPage api={makeApi(deleted)} datasetId={ID} />);
    expect(
      await screen.findByText("This dataset was deleted.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete dataset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm columns" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dataset-column")[2]).toHaveTextContent("Approvers");
  });

  it("reads in Arabic, with Latin digits", async () => {
    renderInRouter(<DatasetPage api={makeApi(dataset)} datasetId={ID} />, "ar");
    const issues = await screen.findAllByTestId("dataset-issue");
    expect(issues[0]).toHaveTextContent("قيم فارغة في approver_1_id: 2");
    expect(document.body.textContent).not.toMatch(/[٠-٩]/);
  });
});
