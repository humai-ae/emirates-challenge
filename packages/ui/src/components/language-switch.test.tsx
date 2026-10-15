import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { LanguageSwitch } from "./language-switch";

describe("LanguageSwitch", () => {
  it("shows each language in its own script and reports the choice", async () => {
    const onChange = vi.fn();
    renderWithI18n(<LanguageSwitch value="en" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "العربية" }));
    expect(onChange).toHaveBeenCalledWith("ar");
  });

  it("ignores a click on the active language", async () => {
    const onChange = vi.fn();
    renderWithI18n(<LanguageSwitch value="ar" onChange={onChange} />, "ar");
    await userEvent.click(screen.getByRole("radio", { name: "العربية" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
