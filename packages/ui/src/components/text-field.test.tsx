import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileField } from "./file-field";
import { SelectField } from "./select-field";
import { TextField } from "./text-field";

describe("form fields", () => {
  it("labels the input and links its hint and its error", () => {
    render(
      <TextField
        label="Work email"
        hint="Your company address."
        error="Enter a valid email address."
        defaultValue="x"
      />,
    );
    const input = screen.getByLabelText("Work email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Your company address. Enter a valid email address.");
  });

  it("leaves a valid input unmarked", () => {
    render(<TextField label="Password" type="password" />);
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
  });

  it("labels a select and links its error", () => {
    render(
      <SelectField label="Team" error="Choose the team this lead runs." defaultValue="">
        <option value="">Choose</option>
      </SelectField>,
    );
    expect(screen.getByLabelText("Team")).toHaveAccessibleDescription(
      "Choose the team this lead runs.",
    );
  });

  it("labels a file input and links its hint and its error", () => {
    render(
      <FileField label="Transactions file" hint="CSV, up to 25 MB." error="Choose a .csv file." />,
    );
    const input = screen.getByLabelText("Transactions file");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("CSV, up to 25 MB. Choose a .csv file.");
  });
});
