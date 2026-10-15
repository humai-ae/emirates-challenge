import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileDrop } from "./file-drop";

const PROMPT = "Drop the CSV files here, or click to choose them.";

describe("FileDrop", () => {
  it("hands over every file chosen in the picker", async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(
      <FileDrop
        label="Data files"
        prompt={PROMPT}
        hint="CSV, up to 25 MB each."
        accept=".csv"
        multiple
        onFiles={onFiles}
      />,
    );
    const input = screen.getByLabelText("Data files");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAccessibleDescription("CSV, up to 25 MB each.");
    const files = [
      new File(["a"], "transactions.csv", { type: "text/csv" }),
      new File(["b"], "employees.csv", { type: "text/csv" }),
    ];
    await user.upload(input, files);
    expect(onFiles).toHaveBeenCalledWith(files);
  });

  it("hands over dropped files", () => {
    const onFiles = vi.fn();
    render(<FileDrop label="Data files" prompt={PROMPT} multiple onFiles={onFiles} />);
    const file = new File(["a"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(screen.getByText(PROMPT), { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("marks the input invalid and links its error", () => {
    render(
      <FileDrop
        label="Data files"
        prompt={PROMPT}
        hint="CSV, up to 25 MB each."
        error="Add the transactions file."
        onFiles={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Data files");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("CSV, up to 25 MB each. Add the transactions file.");
  });
});
