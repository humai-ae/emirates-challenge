import { type ApiClient, ApiError, type DatasetDetail, type DatasetSummary } from "@hrcc/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { DataPage } from "./data-page";

const ready: DatasetSummary = {
  id: "5d9b5c1e-3f0a-4c8e-9a71-2b6f4e8d1c30",
  name: "Training pack",
  status: "ready",
  rejection: null,
  transactionCount: 1_300,
  employeeCount: 60,
  periodFrom: "2025-01-02",
  periodTo: "2025-12-30",
  issueCount: 3,
  columnsConfirmed: false,
  createdAt: "2026-10-15T09:00:00.000Z",
  createdBy: "Layla Haddad",
};
const deleted: DatasetSummary = {
  ...ready,
  id: "6e0c6d2f-4a1b-4d9f-8b82-3c7a5f9e2d41",
  name: "Old pack",
  status: "deleted",
  columnsConfirmed: true,
};
const detail: DatasetDetail = { ...ready, files: [], columns: [], issues: [] };

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listDatasets: vi.fn().mockResolvedValue({ datasets: [ready, deleted] }),
    uploadDataset: vi.fn().mockResolvedValue({ dataset: detail }),
    ...overrides,
  } as unknown as ApiClient;
}

const file = (name: string) => new File(["id\n1\n"], name, { type: "text/csv" });

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Upload data" }));
}

describe("DataPage", () => {
  it("lists datasets with their status, counts and period", async () => {
    renderInRouter(<DataPage api={makeApi()} onUploaded={vi.fn()} />);
    const rows = await screen.findAllByTestId("dataset-row");
    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByRole("link", { name: "Training pack" })).toHaveAttribute(
      "href",
      `/data/${ready.id}`,
    );
    expect(first.getByText("Ready")).toBeInTheDocument();
    expect(first.getByText("Check columns")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("1,300");
    expect(rows[0]).toHaveTextContent("2 Jan 2025 – 30 Dec 2025");
    const second = within(rows[1] as HTMLElement);
    expect(second.getByText("Deleted")).toBeInTheDocument();
    expect(second.queryByText("Check columns")).not.toBeInTheDocument();
  });

  it("keeps Latin digits in Arabic", async () => {
    renderInRouter(<DataPage api={makeApi()} onUploaded={vi.fn()} />, "ar");
    const rows = await screen.findAllByTestId("dataset-row");
    expect(rows[0]?.textContent).toMatch(/1.300/);
    expect(rows[0]?.textContent).not.toMatch(/[٠-٩]/);
  });

  it("shows the empty state before anything is uploaded", async () => {
    const api = makeApi({ listDatasets: vi.fn().mockResolvedValue({ datasets: [] }) });
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    expect(await screen.findByText("No data loaded yet")).toBeInTheDocument();
  });

  it("uploads both files and opens the new dataset", async () => {
    const api = makeApi();
    const onUploaded = vi.fn();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={onUploaded} />);
    await openForm(user);
    await user.type(screen.getByLabelText("Name"), "Training pack");
    await user.upload(screen.getByLabelText("Transactions file"), file("transactions.csv"));
    await user.upload(screen.getByLabelText("Employees file"), file("employees.csv"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(detail));
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect(body.get("name")).toBe("Training pack");
    expect((body.get("transactions") as File).name).toBe("transactions.csv");
    expect((body.get("employees") as File).name).toBe("employees.csv");
    expect(body.has("employeesFromDatasetId")).toBe(false);
  });

  it("checks the files before uploading", async () => {
    const api = makeApi();
    // Let the test pick a file the input's accept list would hide.
    const user = userEvent.setup({ applyAccept: false });
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Transactions file"), file("transactions.xlsx"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Choose a .csv file.")).toBeInTheDocument();
    expect(screen.getByText("Choose a file.")).toBeInTheDocument();
    expect(api.uploadDataset).not.toHaveBeenCalled();
  });

  it("can reuse the employees of an earlier dataset", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Transactions file"), file("transactions.csv"));
    await user.selectOptions(screen.getByLabelText("Employees"), ready.id);
    expect(screen.queryByLabelText("Employees file")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(api.uploadDataset).toHaveBeenCalled());
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect(body.get("employeesFromDatasetId")).toBe(ready.id);
    expect(body.has("employees")).toBe(false);
  });

  it("explains a file that is not UTF-8", async () => {
    const api = makeApi({
      uploadDataset: vi.fn().mockRejectedValue(
        new ApiError(400, {
          code: "file_unreadable",
          params: { file: "transactions", reason: "not_utf8" },
        }),
      ),
    });
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Transactions file"), file("transactions.csv"));
    await user.upload(screen.getByLabelText("Employees file"), file("employees.csv"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The transactions file isn't saved as UTF-8. In Excel, choose Save As → CSV UTF-8 and upload it again.",
    );
  });
});
