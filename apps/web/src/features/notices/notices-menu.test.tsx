import type { ApiClient, NoticesResponse } from "@hrcc/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../../test/render";
import { NoticesMenu } from "./notices-menu";

const NOTICES: NoticesResponse = {
  notices: [
    {
      id: "0b1c2d3e-4f5a-4b6c-8d7e-8f9a0b1c2d3e",
      kind: "flag_sent_to_team",
      params: { flagId: "F-000001", ruleId: "R-01", by: "Omar Siddiqui" },
      createdAt: "2026-10-16T08:00:00.000Z",
      readAt: null,
    },
  ],
  unread: 1,
};

describe("NoticesMenu", () => {
  it("shows the unread count and opens each notice on its flag", async () => {
    const user = userEvent.setup();
    const api = {
      listNotices: vi.fn().mockResolvedValue(NOTICES),
      readNotice: vi.fn().mockResolvedValue({ ...NOTICES, unread: 0 }),
      readAllNotices: vi.fn().mockResolvedValue({ ...NOTICES, unread: 0 }),
    } as unknown as ApiClient;
    renderInRouter(<NoticesMenu api={api} userRole="lead" />);
    const button = await screen.findByRole("button", { name: /^Notices\s*1$/ });
    await user.click(button);
    const link = screen.getByRole("link", {
      name: /Omar Siddiqui sent F-000001 \(R-01\) to your team\./,
    });
    expect(link).toHaveAttribute("href", "/lead/flags/F-000001");
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(api.readAllNotices).toHaveBeenCalled();
  });

  it("says when there are no notices", async () => {
    const user = userEvent.setup();
    const api = {
      listNotices: vi.fn().mockResolvedValue({ notices: [], unread: 0 }),
    } as unknown as ApiClient;
    renderInRouter(<NoticesMenu api={api} userRole="analyst" />);
    await user.click(await screen.findByRole("button", { name: "Notices" }));
    expect(screen.getByText("No notices yet.")).toBeInTheDocument();
  });
});
