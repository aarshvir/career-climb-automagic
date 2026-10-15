import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CvCheck from "@/pages/CvCheck";
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import {
  clearCheckRecovery,
  clearRetainedCheck,
  readCheckRecovery,
  rememberCheckRecovery,
  type CheckDraft,
} from "@/lib/check-draft";

vi.unmock("react-router-dom");
const mocks = vi.hoisted(() => ({
  auth: {
    user: null as null | { id: string; email: string },
    loading: false,
    authError: null as string | null,
    retryConnection: vi.fn(),
  },
  save: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  tracker: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/pages/Auth", () => ({ default: () => <div>Optional account form</div> }));
vi.mock("@/lib/free-check-api", () => ({
  saveFreeCheck: mocks.save,
  listFreeChecks: mocks.list,
  deleteFreeCheck: mocks.remove,
}));
vi.mock("@/lib/workspace-api", () => ({ addApplication: mocks.tracker }));
// The final stage now prepares a PDF preview automatically; keep it local and offline.
vi.mock("@/lib/document-export", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/document-export")>()), createReviewedPdfPreview: mocks.preview,
}));

const recoveryKey = "jobvance_check_recovery_v1";
const source = [
  "Alex Example",
  "EXPERIENCE",
  "• Prepared weekly operations reports using Excel.",
  "• Coordinated reporting improvements across two teams.",
  "• Internal client label: HOLD-BACK-FOR-REVIEW.",
  "SKILLS",
  "Excel, Power BI",
  "EDUCATION",
  "Bachelor of Business Administration",
].join("\n");
const edited = source.replace("\n• Internal client label: HOLD-BACK-FOR-REVIEW.", "")
  + "\n\nADDITIONAL EXPERIENCE\n• Built a reporting checklist for weekly reviews.";
const vacancy = [
  "Responsibilities",
  "• Prepare weekly operations reports using Excel.",
  "• Coordinate reporting improvements with colleagues.",
  "Requirements",
  "• Explain findings clearly to stakeholders.",
].join("\n");
const draft: CheckDraft = {
  jobTitle: "Operations Analyst",
  company: "Example Employer",
  sourceText: source,
  reviewedText: edited,
  jobDescription: vacancy,
};

function tree() {
  return <HelmetProvider><MemoryRouter initialEntries={["/check"]}><CvCheck /></MemoryRouter></HelmetProvider>;
}

function retainOwnedDraft() {
  rememberCheckRecovery({
    draft,
    step: 5,
    cvReady: true,
    filename: "reviewed-cv.txt",
    ownerId: "owner-a",
    pageTarget: 2,
    audience: "professional",
  }, true);
}

function enterAndEditCv() {
  fireEvent.change(screen.getByLabelText("Job title"), { target: { value: draft.jobTitle } });
  fireEvent.change(screen.getByLabelText("Company (optional)"), { target: { value: draft.company } });
  fireEvent.change(screen.getByLabelText("Your CV"), { target: { value: source } });
  fireEvent.change(screen.getByLabelText("The job description"), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));
  fireEvent.change(screen.getByLabelText("Your CV for this job"), { target: { value: edited } });
  expect(screen.getByLabelText("Your CV for this job")).toHaveValue(edited);
}

// The CV and vacancy now share stage 1; the rail is the way back to edit either.
function goToInputs() {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Check progress" })).getByRole("button", { name: "Add your CV and the job" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTrackingDraftMemory();
  mocks.auth.user = null;
  mocks.auth.loading = false;
  mocks.auth.authError = null;
  mocks.list.mockResolvedValue([]);
  mocks.preview.mockResolvedValue({ blob: new Blob(["%PDF work-preservation fixture"], { type: "application/pdf" }), pageCount: 1 });
  sessionStorage.clear();
  localStorage.clear();
  clearRetainedCheck();
  clearCheckRecovery();
});

afterEach(() => {
  cleanup();
  clearRetainedCheck();
  clearCheckRecovery();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("JV-01 CV work preservation", () => {
  it("waits for auth before restoring the rightful owner's consented draft or overwriting its stored text", async () => {
    retainOwnedDraft();
    mocks.auth.loading = true;
    const view = render(tree());

    // A persisted sign-in has not resolved yet. Unknown identity must not erase
    // a valid owned draft or replace it with the blank guest form.
    const retainedWhileAuthLoads = sessionStorage.getItem(recoveryKey);
    expect(retainedWhileAuthLoads).not.toBeNull();
    expect(JSON.parse(retainedWhileAuthLoads!).value).toMatchObject({ ownerId: "owner-a", draft });
    expect(mocks.list).not.toHaveBeenCalled();

    await act(async () => {
      mocks.auth.user = { id: "owner-a", email: "owner-a@example.test" };
      setTrackingDraftOwner('owner-a');
      mocks.auth.loading = false;
      view.rerender(tree());
    });

    expect(await screen.findByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(readCheckRecovery("owner-a")?.value).toMatchObject({
      ownerId: "owner-a", draft, step: 5, filename: "reviewed-cv.txt", pageTarget: 2,
    });
    expect(JSON.parse(sessionStorage.getItem(recoveryKey)!).value.draft).toEqual(draft);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("does not restore a different owner's private CV after delayed auth settles", async () => {
    retainOwnedDraft();
    mocks.auth.loading = true;
    const view = render(tree());

    await act(async () => {
      mocks.auth.user = { id: "owner-b", email: "owner-b@example.test" };
      setTrackingDraftOwner('owner-b');
      mocks.auth.loading = false;
      view.rerender(tree());
    });

    expect(await screen.findByLabelText("Job title")).toHaveValue("");
    expect(screen.queryByLabelText("Your CV for this job")).not.toBeInTheDocument();
    expect(screen.queryByText("HOLD-BACK-FOR-REVIEW", { exact: false })).not.toBeInTheDocument();
    const recovered = readCheckRecovery("owner-b");
    expect(recovered?.value.draft.sourceText ?? "").toBe("");
    expect(recovered?.value.draft.reviewedText ?? "").toBe("");
    expect(mocks.list.mock.calls.every(([ownerId]) => ownerId === "owner-b")).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("preserves exact manually edited wording and removals when an unchanged vacancy is checked again", () => {
    render(tree());
    enterAndEditCv();

    goToInputs();
    expect(screen.getByLabelText("The job description")).toHaveValue(vacancy);
    fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));

    expect(screen.getByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(readCheckRecovery(null)?.value.draft).toEqual(draft);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("preserves exact final edits when the unchanged source CV is reconfirmed before checking the vacancy again", () => {
    render(tree());
    enterAndEditCv();

    goToInputs();
    expect(screen.getByLabelText("Your CV")).toHaveValue(source);
    // Re-entering the identical source is a reconfirmation, not a replacement.
    fireEvent.change(screen.getByLabelText("Your CV"), { target: { value: source } });
    expect(readCheckRecovery(null)?.value.draft.reviewedText).toBe(edited);
    fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));

    expect(screen.getByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(readCheckRecovery(null)?.value.draft).toEqual(draft);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("never persists owner A's draft under owner B while changing accounts", async () => {
    retainOwnedDraft();
    mocks.auth.user = { id: "owner-a", email: "owner-a@example.test" };
    const view = render(tree());
    expect(await screen.findByLabelText("Your CV for this job")).toHaveValue(edited);
    const writes = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      mocks.auth.user = { id: "owner-b", email: "owner-b@example.test" };
      setTrackingDraftOwner('owner-b');
      view.rerender(tree());
    });

    expect(await screen.findByLabelText("Job title")).toHaveValue("");
    expect(screen.queryByLabelText("Your CV for this job")).not.toBeInTheDocument();
    for (const [key, value] of writes.mock.calls) {
      if (key !== recoveryKey) continue;
      const stored = JSON.parse(value);
      if (stored.value.ownerId === "owner-b") {
        expect(stored.value.draft).toEqual({
          jobTitle: "", company: "", sourceText: "", reviewedText: "", jobDescription: "",
        });
      }
    }
    const recovered = readCheckRecovery("owner-b");
    expect(recovered?.value.draft.sourceText ?? "").toBe("");
    expect(recovered?.value.draft.reviewedText ?? "").toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("clears the previous private draft when the signed-in owner signs out", async () => {
    retainOwnedDraft();
    mocks.auth.user = { id: "owner-a", email: "owner-a@example.test" };
    const view = render(tree());
    expect(await screen.findByLabelText("Your CV for this job")).toHaveValue(edited);

    await act(async () => {
      mocks.auth.user = null;
      setTrackingDraftOwner(null);
      view.rerender(tree());
    });

    expect(await screen.findByLabelText("Job title")).toHaveValue("");
    expect(screen.queryByLabelText("Your CV for this job")).not.toBeInTheDocument();
    const recovered = readCheckRecovery(null);
    expect(recovered?.value.draft.sourceText ?? "").toBe("");
    expect(recovered?.value.draft.reviewedText ?? "").toBe("");
    const stored = sessionStorage.getItem(recoveryKey);
    if (stored) {
      expect(JSON.parse(stored).value).toMatchObject({
        ownerId: null, draft: { sourceText: "", reviewedText: "" },
      });
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps an open guest draft through email sign-in but requires a fresh approval", async () => {
    const view = render(tree());
    enterAndEditCv();
    fireEvent.click(screen.getByRole("button", { name: "Continue to download" }));
    const confirm = screen.getByLabelText(/I have checked this CV/);
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    expect(screen.getByText("Ready to download")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeEnabled();

    await act(async () => {
      mocks.auth.user = { id: "owner-a", email: "owner-a@example.test" };
      setTrackingDraftOwner('owner-a');
      view.rerender(tree());
    });

    expect(readCheckRecovery("owner-a")?.value).toMatchObject({ ownerId: "owner-a", draft, step: 6 });
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    expect(screen.getByLabelText(/I have checked this CV/)).not.toBeChecked();
    expect(screen.queryByText("Ready to download")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Save these reviewed texts privately in my account.")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save approved check to my account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("preserves edited wording and removals when the vacancy changes and evidence is recomputed", () => {
    render(tree());
    enterAndEditCv();
    const changedVacancy = vacancy + "\n• Create a checklist for reporting quality reviews.";

    goToInputs();
    fireEvent.change(screen.getByLabelText("The job description"), { target: { value: changedVacancy } });
    fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));

    expect(screen.getByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(readCheckRecovery(null)?.value.draft).toEqual({ ...draft, jobDescription: changedVacancy });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it("keeps an owned draft hidden and intact after failed auth bootstrap, then restores it after retry", async () => {
    retainOwnedDraft();
    mocks.auth.loading = true;
    const view = render(tree());

    await act(async () => {
      mocks.auth.loading = false;
      mocks.auth.authError = "We could not restore your sign-in session.";
      view.rerender(tree());
    });

    expect(screen.queryByLabelText("Job title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Your CV for this job")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your sign-in could not be restored");
    const retainedAfterFailure = sessionStorage.getItem(recoveryKey);
    expect(retainedAfterFailure).not.toBeNull();
    expect(JSON.parse(retainedAfterFailure!).value).toMatchObject({ ownerId: "owner-a", draft });
    expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry sign-in recovery" }));
    expect(mocks.auth.retryConnection).toHaveBeenCalledOnce();

    await act(async () => {
      mocks.auth.loading = true;
      mocks.auth.authError = null;
      view.rerender(tree());
    });
    expect(screen.queryByLabelText("Your CV for this job")).not.toBeInTheDocument();

    await act(async () => {
      mocks.auth.user = { id: "owner-a", email: "owner-a@example.test" };
      setTrackingDraftOwner('owner-a');
      mocks.auth.loading = false;
      view.rerender(tree());
    });

    expect(await screen.findByLabelText("Your CV for this job")).toHaveValue(edited);
    expect(readCheckRecovery("owner-a")?.value).toMatchObject({ ownerId: "owner-a", draft, step: 5 });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });
});
