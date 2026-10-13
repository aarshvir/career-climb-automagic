import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CareerGuides, { CareerGuideArticle } from "@/pages/CareerGuides";
import { careerGuides } from "@/lib/career-guides";

vi.unmock("react-router-dom");
vi.unmock("react-helmet-async");

function renderPage(path = "/guides") {
  return render(<HelmetProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/guides" element={<CareerGuides />} /><Route path="/guides/:slug" element={<CareerGuideArticle />} /></Routes></MemoryRouter></HelmetProvider>);
}

describe("public career guides", () => {
  it("shows the full library, labelled filters and a free first action", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A clearer next step");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(20);
    expect(screen.getByLabelText("Search the guides")).toHaveAttribute("type", "search");
    expect(screen.getByLabelText("Your stage")).toHaveValue("all");
    expect(screen.getByLabelText("Your task")).toHaveValue("all");
    expect(screen.getByRole("status")).toHaveTextContent("20 guides to explore");
    expect(screen.getByRole("link", { name: "Check my CV for free" })).toHaveAttribute("href", "/check");
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
  });

  it("supports keyboard filtering while keeping common guidance available", async () => {
    const user = userEvent.setup();
    renderPage();
    screen.getByLabelText("Search the guides").focus();
    await user.tab();
    expect(screen.getByLabelText("Your stage")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Your stage"), "Students");
    expect(screen.getByRole("link", { name: "Show student projects without calling them work experience" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compare your CV with a job description using evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Build an MBA career-pivot CV with a credible bridge" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Your task"), "UAE job search");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("offers useful recovery from an empty search", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Search the guides"), "zzzz-no-matching-guide");
    expect(screen.getByRole("status")).toHaveTextContent("0 guides match your choices");
    expect(screen.getByRole("heading", { name: "No guide matches these choices yet." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ask for workflow help" })).toHaveAttribute("href", "/contact");
    await user.click(screen.getByRole("button", { name: "Show all guides" }));
    expect(screen.getByLabelText("Search the guides")).toHaveValue("");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(20);
  });

  it("renders a complete article with working contents, citations and honest attribution", async () => {
    const guide = careerGuides[0];
    const { container } = renderPage(`/guides/${guide.slug}`);
    expect(screen.getByRole("heading", { level: 1, name: guide.title })).toBeInTheDocument();
    const contents = screen.getByRole("navigation", { name: "On this page" });
    for (const link of within(contents).getAllByRole("link")) {
      const id = link.getAttribute("href")?.slice(1);
      expect(container.querySelector(`[id="${id}"]`)).toBeInTheDocument();
    }
    expect(screen.getByText("Fictional example")).toBeInTheDocument();
    expect(screen.getByText("Jobvance Editorial", { selector: ".cg-byline span" })).toBeInTheDocument();
    expect(container.querySelectorAll(".cg-source-note")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Sources and further reading" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`${guide.title} | Jobvance`));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", `https://jobvance.io/guides/${guide.slug}`);
  });

  it("renders every article without hiding its main content behind an account", () => {
    for (const guide of careerGuides) {
      const view = renderPage(`/guides/${guide.slug}`);
      expect(screen.getByRole("heading", { level: 1, name: guide.title })).toBeInTheDocument();
      for (const section of guide.sections) expect(screen.getByRole("heading", { name: section.heading })).toBeInTheDocument();
      expect(screen.getByText(guide.sections.at(-1)!.paragraphs.at(-1)!)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("gives an unknown guide a recoverable no-index page", async () => {
    renderPage("/guides/not-a-real-guide");
    expect(screen.getByRole("heading", { level: 1, name: "We could not find that guide." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the guide library" })).toHaveAttribute("href", "/guides");
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow"));
  });
});
