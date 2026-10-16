import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DATASET } from "../../test/rules";
import { ParameterField } from "./parameter-field";

describe("ParameterField", () => {
  it("leaves an optional document list unset when every box is unticked", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ParameterField
        spec={{ name: "any_of", type: "string[]", optional: true, vocabulary: "documents" }}
        value={["resignation_letter"]}
        onChange={onChange}
        dataset={DATASET}
        edited={false}
        leastSure={false}
        problem={null}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "resignation_letter" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps an empty choice for 'only these types'", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ParameterField
        spec={{ name: "types", type: "string[]", optional: true, vocabulary: "types" }}
        value={["overtime"]}
        onChange={onChange}
        dataset={DATASET}
        edited={false}
        leastSure={false}
        problem={null}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "overtime" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("offers 'every type' only for the rule's own types", () => {
    renderWithProviders(
      <ParameterField
        spec={{ name: "not_requester", type: "string[]", optional: true, vocabulary: "types" }}
        value={null}
        onChange={vi.fn()}
        dataset={DATASET}
        edited={false}
        leastSure={false}
        problem={null}
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });
});
