import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PilotDemo from "@/pages/PilotDemo";
import { buildPilotDemoText, buildPilotRecruiterDraft, downloadPilotDemo, pilotFacts, type PilotRole } from "@/lib/pilot-demo";

const mocks = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock("@/lib/document-download", () => ({ downloadBlob: mocks.downloadBlob }));

beforeEach(() => vi.clearAllMocks());

async function reviewAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Keep the safe replacement" }));
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
}

describe("fictional pilot demo", () => {
  it("discloses a static fictional example and blocks downloads before explicit review and approval", () => {
    render(<PilotDemo />);
    expect(screen.getByText(/static concept demonstration/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve fictional CV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download fictional CV (.txt)" })).toBeDisabled();
    expect(() => downloadPilotDemo("strategy", false)).toThrow("approve");
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });

  it("shows source-linked wording and a rejected exaggerated edit with reasons", async () => {
    const user = userEvent.setup();
    render(<PilotDemo />);
    expect(screen.getByText(/Led a procurement transformation/)).toBeInTheDocument();
    expect(screen.getByText(/turns a projection into a realized result/)).toBeInTheDocument();
    await user.click(screen.getByText("Read source passage — SRC-01"));
    expect(screen.getByText(/It did not establish realized savings/)).toBeVisible();
    expect(screen.getByLabelText("I checked F-01 against SRC-01.")).not.toBeChecked();
  });

  it("requires all fact checks plus safe replacement review before approval and a real download", async () => {
    const user = userEvent.setup();
    render(<PilotDemo />);
    await reviewAll(user);
    expect(screen.getByRole("button", { name: "Approve fictional CV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download fictional CV (.txt)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Approve fictional CV" }));
    await user.click(screen.getByRole("button", { name: "Download fictional CV (.txt)" }));
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "jobvance-fictional-demo-strategy.txt");
    expect(screen.getByText(/Nothing was submitted or sent/)).toBeInTheDocument();
  });

  it("changes relevance order without changing facts and revokes the previous role approval", async () => {
    const user = userEvent.setup();
    render(<PilotDemo />);
    await reviewAll(user);
    await user.click(screen.getByRole("button", { name: "Approve fictional CV" }));
    await user.click(screen.getByRole("button", { name: "Transformation" }));
    expect(screen.getByRole("button", { name: "Transformation" })).toHaveAttribute("aria-pressed", "true");
    const rows = within(screen.getByRole("list", { name: "Fictional CV facts" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(pilotFacts["F-02"].wording);
    expect(rows[1]).toHaveTextContent(pilotFacts["F-01"].wording);
    expect(screen.getAllByRole("checkbox").every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Download fictional CV (.txt)" })).toBeDisabled();
  });

  it("revokes approval when a checked fact is unchecked", async () => {
    const user = userEvent.setup();
    render(<PilotDemo />);
    await reviewAll(user);
    await user.click(screen.getByRole("button", { name: "Approve fictional CV" }));
    await user.click(screen.getByLabelText("I checked F-01 against SRC-01."));
    expect(screen.getByRole("button", { name: "Download fictional CV (.txt)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve fictional CV" })).toBeDisabled();
  });

  it("exports the same truthful facts for both roles and never includes restricted or inflated claims", () => {
    for (const role of ["strategy", "transformation"] as PilotRole[]) {
      const document = buildPilotDemoText(role);
      expect(document).toContain("FICTIONAL CONCEPT DEMO");
      expect(document).toContain("Alex Morgan (fictional)");
      for (const fact of Object.values(pilotFacts)) expect(document).toContain(fact.wording);
      expect(document).not.toContain("$4.2M");
      expect(document).not.toContain("SRC-04");
      expect(document).not.toMatch(/\bled\b|\bdelivered\b|\brealized\b/i);
    }
  });

  it("shows a real evidence gap and includes the grounded draft and next step in the fictional packet", async () => {
    const user = userEvent.setup();
    render(<PilotDemo />);
    await user.click(screen.getByRole("button", { name: "Transformation" }));
    const requirements = within(screen.getByRole("list", { name: "Fictional role requirements" })).getAllByRole("listitem");
    const ownership = requirements.find((item) => item.textContent?.includes("Transformation delivery ownership"));
    expect(ownership).toHaveTextContent("Not established from these facts");
    const draft = screen.getByRole("textbox", { name: "Prewritten fictional recruiter draft" });
    expect(draft).toHaveAttribute("readonly");
    expect(draft).toHaveValue(buildPilotRecruiterDraft("transformation"));
    const packet = buildPilotDemoText("transformation");
    expect(packet).toContain("FICTIONAL ROLE BRIEF — NOT A LIVE VACANCY");
    expect(packet).toContain("Transformation delivery ownership: Not established");
    expect(packet).toContain(buildPilotRecruiterDraft("transformation"));
    expect(packet).toContain("PROPOSED NEXT STEP");
    expect(packet).not.toContain("$4.2M");
    expect(packet).not.toContain("SRC-04");
    expect(packet).not.toContain("Led a procurement transformation");
  });
});
