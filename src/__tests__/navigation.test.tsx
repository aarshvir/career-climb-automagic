import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MvpHeader from "@/components/layout/MvpHeader";

vi.unmock("react-router-dom");
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
afterEach(cleanup);
function show() {
  render(<MemoryRouter><MvpHeader /><Routes><Route path="*" element={<div id="main-content">Page content</div>} /></Routes></MemoryRouter>);
}
describe("responsive navigation", () => {
  it("opens and closes with Escape and returns focus to the menu button", () => {
    show(); const toggle = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("navigation", { name: "Mobile navigation" }), { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false"); expect(toggle).toHaveFocus();
  });
  it("closes after choosing a destination and has a working skip target", () => {
    show(); fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("link", { name: "Job Loop" }));
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    expect(document.querySelector("#main-content")).toBeInTheDocument();
  });
});
