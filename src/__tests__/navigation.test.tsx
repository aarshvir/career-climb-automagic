import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MvpHeader from "@/components/layout/MvpHeader";
import MvpFooter from "@/components/layout/MvpFooter";

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
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("link", { name: "Automated Job Loop" }));
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    expect(document.querySelector("#main-content")).toBeInTheDocument();
  });
  it("locks scroll and makes the page inert while open, then restores both", () => {
    render(<MemoryRouter><MvpHeader /><div id="main-content">Page content</div><footer>Footer</footer></MemoryRouter>);
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    const main = document.getElementById("main-content")!, footer = document.querySelector("footer")!;
    fireEvent.click(toggle);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(main).toHaveAttribute("inert"); expect(footer).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false"); expect(toggle).toHaveFocus();
    expect(main).not.toHaveAttribute("inert"); expect(footer).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe(""); expect(document.documentElement.style.overflow).toBe("");
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("link", { name: "Pricing" }));
    expect(main).not.toHaveAttribute("inert"); expect(document.body.style.overflow).toBe("");
  });
});

describe("footer links", () => {
  it("keeps exactly the 8 site links and 4 legal links", () => {
    render(<MemoryRouter><MvpFooter /></MemoryRouter>);
    const hrefs = (name: string) => within(screen.getByRole("navigation", { name })).getAllByRole("link").map(link => link.getAttribute("href"));
    expect(hrefs("Footer navigation")).toEqual(["/job-loop", "/check", "/pricing", "/guides", "/walkthroughs", "/help", "/about", "/contact"]);
    expect(hrefs("Legal navigation")).toEqual(["/privacy", "/privacy#advertising-measurement", "/terms", "/refund"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Product", "Resources", "Company"]);
  });
});
