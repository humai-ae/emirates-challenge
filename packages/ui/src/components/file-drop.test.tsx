import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FileDrop } from "./file-drop";

const PROMPT = "Drop transactions.csv here, or click to choose it.";

function Harness({ error }: { error?: string }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <FileDrop
      label="Transactions file"
      prompt={PROMPT}
      hint="CSV, up to 25 MB."
      accept=".csv"
      file={file}
      onFile={setFile}
      error={error}
      formatSize={(bytes) => `${bytes} B`}
      removeLabel="Remove"
    />
  );
}

describe("FileDrop", () => {
  it("takes a file from the picker, shows its name and size, and removes it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Transactions file");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAccessibleDescription("CSV, up to 25 MB.");
    await user.upload(input, new File(["id\n1\n"], "transactions.csv", { type: "text/csv" }));
    expect(screen.getByText("transactions.csv")).toBeInTheDocument();
    expect(screen.getByText("5 B")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("transactions.csv")).not.toBeInTheDocument();
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
  });

  it("takes a dropped file", () => {
    render(<Harness />);
    const file = new File(["id\n1\n"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(screen.getByText(PROMPT), { dataTransfer: { files: [file] } });
    expect(screen.getByText("dropped.csv")).toBeInTheDocument();
  });

  it("marks the input invalid and links its error", () => {
    render(<Harness error="Choose a .csv file." />);
    const input = screen.getByLabelText("Transactions file");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("CSV, up to 25 MB. Choose a .csv file.");
  });
});
