import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CvCheck from "@/pages/CvCheck";

vi.unmock("react-router-dom");
const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string }, loading: false },
  save: vi.fn(), list: vi.fn(), remove: vi.fn(), download: vi.fn(), tracker: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/pages/Auth", () => ({ default: () => <div>Optional account form</div> }));
vi.mock("@/lib/free-check-api", () => ({ saveFreeCheck: mocks.save, listFreeChecks: mocks.list, deleteFreeCheck: mocks.remove }));
vi.mock("@/lib/document-download", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/document-download")>()), downloadBlob: mocks.download }));
vi.mock("@/lib/workspace-api", () => ({ addApplication: mocks.tracker }));

const source = "Alex Example\nEXPERIENCE\n• Prepared monthly stakeholder reports using Excel.\n• Supported a transformation pilot across five units.\n• Facilitated weekly workstream meetings.\nSKILLS\nExcel, Power BI\nEDUCATION\nBachelor of Business Administration";
const StandardURL = globalThis.URL;
const vacancy = "Responsibilities\n• Prepare monthly stakeholder reports using Excel.\n• Lead a transformation programme.\nRequirements\n• PMP certification required.\n• At least five years of transformation experience.";
function show() { return render(<HelmetProvider><MemoryRouter><CvCheck /></MemoryRouter></HelmetProvider>); }
async function toReview() {
  fireEvent.change(screen.getByLabelText("Target role"), { target: { value: "Transformation Manager" } });
  fireEvent.change(screen.getByLabelText("Company (optional)"), { target: { value: "Example Employer" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to your CV" }));
  fireEvent.change(screen.getByLabelText("CV text — paste, correct or remove private information"), { target: { value: source } });
  fireEvent.click(screen.getByRole("button", { name: "Use this reviewed CV text" }));
  fireEvent.change(screen.getByLabelText("Vacancy description"), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole("button", { name: "Check these inputs" }));
  fireEvent.click(screen.getByRole("button", { name: "Review my CV & questions" }));
}
async function toApproval() { await toReview(); fireEvent.click(screen.getByRole("button", { name: "Recheck my changes & continue" })); fireEvent.click(screen.getByText("Evidence from your final CV — review the findings")); }
function approve() {
  fireEvent.click(screen.getByLabelText(/I reviewed the complete CV and vacancy/));
  fireEvent.click(screen.getByLabelText(/Both my source CV and final CV are safe/));
  fireEvent.click(screen.getByRole("button", { name: "Approve this CV" }));
}
beforeEach(() => {
  vi.stubGlobal("URL", class extends StandardURL { static createObjectURL = vi.fn(() => "blob:synthetic-reviewed-cv"); static revokeObjectURL = vi.fn(); });
  vi.clearAllMocks(); mocks.auth.user = null; mocks.auth.loading = false; mocks.list.mockResolvedValue([]); sessionStorage.clear(); localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("six-step free CV check", () => {
  it("runs a real evidence check and permits a guest TXT only after review without quota, storage or network writes", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"), fetch = vi.spyOn(globalThis, "fetch");
    show(); await toApproval();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    expect(screen.getByText("Lead a transformation programme.")).toBeInTheDocument();
    const leadershipFinding = screen.getByRole("article", { name: "Vacancy finding: Lead a transformation programme." });
    expect(within(leadershipFinding).getByText("Supported a transformation pilot across five units.", { exact: true })).toBeInTheDocument();
    expect(within(leadershipFinding).getByText("Related passage — review needed")).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
    approve(); fireEvent.click(screen.getByRole("button", { name: "Download TXT" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(mocks.download.mock.calls[0][1]).toBe("CV-Transformation Manager.txt");
    expect(screen.getByRole("link", { name: "save the prepared file: CV-Transformation Manager.txt" })).toHaveAttribute("download", "CV-Transformation Manager.txt");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.tracker).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    storage.mockRestore(); fetch.mockRestore();
  });
  it("keeps gap questions outside the CV and recalculates after a deliberate truthful addition", async () => {
    show(); await toReview();
    const before = screen.getByLabelText("Your CV to review") as HTMLTextAreaElement;
    expect(before.value).not.toContain("PMP certification required");
    fireEvent.change(screen.getByLabelText("Your own truthful example"), { target: { value: "Led a transformation programme for two divisions in 2025." } });
    fireEvent.click(screen.getByRole("button", { name: "Add my example to the CV" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm this example is accurate");
    fireEvent.click(screen.getByLabelText(/This example is accurate/));
    fireEvent.click(screen.getByRole("button", { name: "Add my example to the CV" }));
    expect(before.value).toContain("Led a transformation programme for two divisions in 2025.");
    fireEvent.click(screen.getByRole("button", { name: "Recheck my changes & continue" }));
    expect(within(screen.getByRole("article", { name: "Vacancy finding: Lead a transformation programme." })).getByText("Added or edited by you during this check", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
  });
  it("invalidates approval and previous save consent after an edit", async () => {
    show(); await toApproval(); approve();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to your review" }));
    const field = screen.getByLabelText("Your CV to review") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: `${field.value}\nAdditional reviewed wording.` } });
    fireEvent.click(screen.getByRole("button", { name: "Recheck my changes & continue" }));
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    expect(screen.getByLabelText(/I reviewed the complete CV and vacancy/)).not.toBeChecked();
    expect(screen.getByLabelText(/Both my source CV and final CV are safe/)).not.toBeChecked();
  });
  it("retains only the corrected source text on an explicit owner save", async () => {
    mocks.auth.user = { id: "account-a", email: "test@example.test" }; mocks.save.mockImplementation(async (id, value) => ({ id: "saved-check", user_id: id, job_title: value.jobTitle, company: value.company, original_text: value.originalText, reviewed_text: value.reviewedText, job_description: value.jobDescription, method_version: value.methodVersion, created_at: "2026-10-11T00:00:00Z" }));
    show(); await toApproval(); approve();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/));
    fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(screen.getByText("Saved privately in your account. No pack credit was used.")).toBeInTheDocument());
    expect(mocks.save).toHaveBeenCalledWith("account-a", expect.objectContaining({ originalText: source, approved: true, jobDescription: vacancy }));
    expect(mocks.tracker).not.toHaveBeenCalled();
  });
  it("does not show a late saved result in another account", async () => {
    mocks.auth.user = { id: "account-a", email: "a@example.test" };
    let finish!: (value: unknown) => void; mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = show(); await toApproval(); approve(); fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/)); fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    mocks.auth.user = { id: "account-b", email: "b@example.test" }; view.rerender(<HelmetProvider><MemoryRouter><CvCheck /></MemoryRouter></HelmetProvider>);
    await act(async () => finish({ id: "private-a", user_id: "account-a", job_title: "Private account A role" }));
    expect(screen.queryByText("Private account A role")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Target role")).toHaveValue("");
  });
  it("surfaces save failure while keeping free exports available", async () => {
    mocks.auth.user = { id: "account-a", email: "a@example.test" }; mocks.save.mockRejectedValue(new Error("Saving is temporarily unavailable."));
    show(); await toApproval(); approve(); fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/)); fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Saving is temporarily unavailable"));
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeEnabled();
  });
  it("rejects incomplete inputs and starts progress at the first real step", () => {
    show(); expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Continue to your CV" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the role");
    fireEvent.change(screen.getByLabelText("Target role"), { target: { value: "Strategy Manager" } }); fireEvent.click(screen.getByRole("button", { name: "Continue to your CV" }));
    fireEvent.change(screen.getByLabelText("CV text — paste, correct or remove private information"), { target: { value: "short" } }); fireEvent.click(screen.getByRole("button", { name: "Use this reviewed CV text" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Too little readable CV text");
  });
});
