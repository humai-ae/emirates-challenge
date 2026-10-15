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

const usedFor = (name: string) => screen.getByRole("combobox", { name: `What ${name} is for` });

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Upload data" }));
}

describe("DataPage", () => {
  it("lists datasets with their status, counts and period, with deleted ones folded away", async () => {
    const user = userEvent.setup();
    renderInRouter(<DataPage api={makeApi()} onUploaded={vi.fn()} />);
    const rows = await screen.findAllByTestId("dataset-row");
    expect(rows).toHaveLength(1);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByRole("link", { name: "Training pack" })).toHaveAttribute(
      "href",
      `/data/${ready.id}`,
    );
    expect(first.getByText("Ready")).toBeInTheDocument();
    expect(first.getByText("Check columns")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("1,300");
    expect(rows[0]).toHaveTextContent("2 Jan 2025 – 30 Dec 2025");
    expect(screen.queryByTestId("deleted-dataset-row")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Deleted datasets (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const deletedRow = screen.getByTestId("deleted-dataset-row");
    expect(within(deletedRow).getByRole("link", { name: "Old pack" })).toHaveAttribute(
      "href",
      `/data/${deleted.id}`,
    );
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
    await user.upload(screen.getByLabelText("Data files"), [
      file("transactions.csv"),
      file("employees.csv"),
    ]);
    // Each file's use is guessed from its name.
    expect(usedFor("transactions.csv")).toHaveValue("transactions");
    expect(usedFor("employees.csv")).toHaveValue("employees");
    await user.type(screen.getByLabelText("Name"), "Training pack");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(detail));
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect(body.get("name")).toBe("Training pack");
    expect((body.get("transactions") as File).name).toBe("transactions.csv");
    expect((body.get("employees") as File).name).toBe("employees.csv");
    expect(body.has("employeesFromDatasetId")).toBe(false);
  });

  it("lets the admin say what each file is for", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), [
      file("export_a.csv"),
      file("export_b.csv"),
    ]);
    // Names that say nothing: the first is taken as transactions, the next as employees.
    expect(usedFor("export_a.csv")).toHaveValue("transactions");
    expect(usedFor("export_b.csv")).toHaveValue("employees");
    await user.selectOptions(usedFor("export_a.csv"), "employees");
    await user.selectOptions(usedFor("export_b.csv"), "transactions");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(api.uploadDataset).toHaveBeenCalled());
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect((body.get("transactions") as File).name).toBe("export_b.csv");
    expect((body.get("employees") as File).name).toBe("export_a.csv");
  });

  it("asks for one file per use", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), [
      file("transactions_jan.csv"),
      file("transactions_feb.csv"),
    ]);
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(
      await screen.findByText("Each use takes one file: change what one of them is for."),
    ).toBeInTheDocument();
    expect(api.uploadDataset).not.toHaveBeenCalled();
  });

  it("removes a file from the list", async () => {
    const user = userEvent.setup();
    renderInRouter(<DataPage api={makeApi()} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), [
      file("transactions.csv"),
      file("employees.csv"),
    ]);
    expect(screen.getAllByTestId("chosen-file")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove employees.csv" }));
    expect(screen.getAllByTestId("chosen-file")).toHaveLength(1);
    expect(screen.queryByText("employees.csv")).not.toBeInTheDocument();
  });

  it("checks the files before uploading", async () => {
    const api = makeApi();
    // Let the test pick a file the input's accept list would hide.
    const user = userEvent.setup({ applyAccept: false });
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), file("transactions.xlsx"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Choose a .csv file.")).toBeInTheDocument();
    expect(
      screen.getByText("Add the employees file, or use the one from an earlier dataset."),
    ).toBeInTheDocument();
    expect(api.uploadDataset).not.toHaveBeenCalled();
  });

  it("can reuse the employees of an earlier dataset", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), file("transactions.csv"));
    await user.click(
      screen.getByRole("button", { name: "Use the employees file from an earlier dataset" }),
    );
    expect(screen.getByLabelText("Employees from")).toHaveValue(ready.id);
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(api.uploadDataset).toHaveBeenCalled());
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect(body.get("employeesFromDatasetId")).toBe(ready.id);
    expect(body.has("employees")).toBe(false);
  });

  it("doesn't offer an earlier dataset's employees once an employees file is chosen", async () => {
    const user = userEvent.setup();
    renderInRouter(<DataPage api={makeApi()} onUploaded={vi.fn()} />);
    await openForm(user);
    const reuse = { name: "Use the employees file from an earlier dataset" };
    expect(screen.getByRole("button", reuse)).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Data files"), [
      file("transactions.csv"),
      file("employees.csv"),
    ]);
    expect(screen.queryByRole("button", reuse)).not.toBeInTheDocument();
    // Without an employees file in the list, the option is back.
    await user.selectOptions(usedFor("employees.csv"), "transactions");
    expect(screen.getByRole("button", reuse)).toBeInTheDocument();
    await user.selectOptions(usedFor("employees.csv"), "employees");
    await user.click(screen.getByRole("button", { name: "Remove employees.csv" }));
    expect(screen.getByRole("button", reuse)).toBeInTheDocument();
  });

  it("lets a dropped employees file replace an earlier dataset's", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    renderInRouter(<DataPage api={api} onUploaded={vi.fn()} />);
    await openForm(user);
    await user.upload(screen.getByLabelText("Data files"), file("transactions.csv"));
    await user.click(
      screen.getByRole("button", { name: "Use the employees file from an earlier dataset" }),
    );
    expect(screen.getByLabelText("Employees from")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Data files"), file("employees.csv"));
    expect(usedFor("employees.csv")).toHaveValue("employees");
    expect(screen.queryByLabelText("Employees from")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await vi.waitFor(() => expect(api.uploadDataset).toHaveBeenCalled());
    const body = vi.mocked(api.uploadDataset).mock.calls[0]?.[0] as FormData;
    expect((body.get("employees") as File).name).toBe("employees.csv");
    expect(body.has("employeesFromDatasetId")).toBe(false);
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
    await user.upload(screen.getByLabelText("Data files"), [
      file("transactions.csv"),
      file("employees.csv"),
    ]);
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The transactions file isn't saved as UTF-8. In Excel, choose Save As → CSV UTF-8 and upload it again.",
    );
  });
});
