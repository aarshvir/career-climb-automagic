import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import PilotLanding from "@/pages/PilotLanding";
import { PILOT_CONTACT, preparePilotRequest } from "@/lib/pilot-request";

vi.mock("@/pages/PilotDemo", () => ({ default: () => <section id="demo">Fictional demonstration</section> }));
function showLanding() {
  return render(<HelmetProvider><PilotLanding /></HelmetProvider>);
}

describe("free pilot request", () => {
  it("prepares an unsent draft without a network submission or local persistence", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    showLanding();
    expect(screen.queryByRole("link", { name: "Open email draft" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Role directions or preparation task"), "Strategy and transformation");
    await user.click(screen.getByRole("button", { name: "Prepare request draft" }));
    expect(screen.getByText("Draft prepared. Nothing has been sent.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open email draft" })).toHaveAttribute("href", expect.stringContaining(`mailto:${PILOT_CONTACT}?`));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore(); storageSpy.mockRestore();
  });

  it("invalidates the previously prepared request when the visitor edits a field", async () => {
    const user = userEvent.setup();
    showLanding();
    await user.type(screen.getByLabelText("Role directions or preparation task"), "Two role families");
    await user.click(screen.getByRole("button", { name: "Prepare request draft" }));
    expect(screen.getByRole("link", { name: "Open email draft" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("I’m exploring this as"), "coach");
    expect(screen.queryByRole("link", { name: "Open email draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prepare request draft" }));
    expect(screen.getByText(/I am a career coach/)).toBeInTheDocument();
  });

  it("rejects whitespace-only preparation tasks rather than implying a received request", async () => {
    const user = userEvent.setup();
    showLanding();
    await user.type(screen.getByLabelText("Role directions or preparation task"), "   ");
    await user.click(screen.getByRole("button", { name: "Prepare request draft" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tell us which role directions");
    expect(screen.queryByRole("link", { name: "Open email draft" })).not.toBeInTheDocument();
  });

  it("encodes visitor content as the body, keeping recipients and subject controlled", () => {
    const draft = preparePilotRequest({ name: "Casey", audience: "coach", directions: "Review roles & facts\n&bcc=unexpected@example.com", availability: "UAE afternoons" });
    const parsed = new URL(draft.href);
    expect(parsed.pathname).toBe(PILOT_CONTACT);
    expect(parsed.searchParams.has("bcc")).toBe(false);
    expect(parsed.searchParams.get("subject")).toBe("Jobvance free pilot discussion — career coach");
    expect(parsed.searchParams.get("body")).toContain("&bcc=unexpected@example.com");
    expect(draft.text).toContain("no payment or job outcome is promised");
  });

  it.each(["student", "mba"] as const)("supports an explicit %s request without presenting it as sent", audience => {
    const draft = preparePilotRequest({ name: "", audience, directions: "Graduate roles and internship applications", availability: "" });
    expect(draft.body).toContain(audience === "mba" ? "I am an MBA student." : "I am a university student.");
    expect(new URL(draft.href).pathname).toBe(PILOT_CONTACT);
  });

  it("rejects unknown participant types, including object prototype properties", () => {
    expect(() => preparePilotRequest({ name: "", audience: "constructor" as never, directions: "A role", availability: "" })).toThrow("Choose a participant type");
  });
});
