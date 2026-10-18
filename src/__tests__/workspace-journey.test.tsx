import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Workspace from "@/pages/Workspace";
import type {
  ApplicationPack,
  TrackedApplication,
  CvDocument,
} from "@/lib/cv-database";
import type { Entitlement } from "@/lib/workspace-api";

vi.unmock("react-router-dom");
vi.unmock("@tanstack/react-query");
vi.mock("@/integrations/supabase/client", () => ({
  configurationError: null,
  supabase: {},
}));
const state = vi.hoisted(() => ({
  user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  data: {
    cvs: [] as CvDocument[],
    packs: [] as ApplicationPack[],
    applications: [] as TrackedApplication[],
    entitlementError: null as string | null,
    entitlement: {
      creditsRemaining: 1,
      expiresAt: null,
      billingConfigured: false,
      billingMode: null,
    } as Entitlement | null,
  },
  fail: false,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}));
const calls = vi.hoisted(() => ({
  upload: vi.fn(),
  extract: vi.fn(),
  download: vi.fn(),
  original: vi.fn(),
  checkout: vi.fn(),
  create: vi.fn(),
  openCheckout: vi.fn(),
}));
vi.mock("@/lib/payment-checkout", () => ({
  isPaddleClientReady: () => true,
  openPaymentCheckout: calls.openCheckout,
}));
vi.mock("@/lib/cv-documents", () => ({
  extractCvText: calls.extract,
  uploadCvDocument: calls.upload,
  deleteCvDocument: vi.fn(),
  downloadOriginalCv: calls.original,
}));
vi.mock("@/lib/document-export", () => ({ downloadPack: calls.download }));
vi.mock("@/lib/cv-legacy", () => ({
  listLegacyCvs: vi.fn(async () => []),
  downloadLegacyCv: vi.fn(),
}));
vi.mock("@/lib/workspace-api", () => ({
  loadWorkspace: vi.fn(async () => {
    if (state.fail) throw new Error("Your saved records could not be loaded.");
    return structuredClone(state.data);
  }),
  workspaceCounts: (apps: TrackedApplication[]) => ({
    saved: apps.filter((a) => a.status === "saved").length,
    applied: apps.filter((a) => a.status === "applied").length,
    interviews: apps.filter((a) => a.status === "interview").length,
  }),
  safeEmployerUrl: (url: string | null) =>
    url?.startsWith("https://") ? url : null,
  applicationStatuses: [
    "saved",
    "applied",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ],
  createPack: calls.create,
  approvePack: vi.fn(async (pack: ApplicationPack, text: string) => {
    const p = state.data.packs.find((p) => p.id === pack.id)!;
    p.tailored_text = text;
    p.status = "approved";
    return p;
  }),
  trackPack: vi.fn(async (pack: ApplicationPack) => {
    state.data.applications.push({
      id: "track1",
      user_id: state.user.id,
      pack_id: pack.id,
      job_title: pack.job_title,
      company: pack.company,
      job_url: pack.job_url,
      status: "saved",
      notes: "",
      applied_at: null,
      follow_up_at: null,
      created_at: "2026-10-10T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
    });
  }),
  addApplication: vi.fn(
    async (
      uid: string,
      input: { jobTitle: string; company: string; jobUrl: string },
    ) => {
      state.data.applications.push({
        id: "track1",
        user_id: uid,
        pack_id: null,
        job_title: input.jobTitle,
        company: input.company,
        job_url: input.jobUrl,
        status: "saved",
        notes: "",
        applied_at: null,
        follow_up_at: null,
        created_at: "2026-10-10T00:00:00Z",
        updated_at: "2026-10-10T00:00:00Z",
      });
    },
  ),
  updateApplication: vi.fn(
    async (item: TrackedApplication, patch: Partial<TrackedApplication>) => {
      Object.assign(
        state.data.applications.find((a) => a.id === item.id)!,
        patch,
        { updated_at: "2026-10-10T01:00:00Z" },
      );
    },
  ),
  deleteApplication: vi.fn(),
  startCheckout: calls.checkout,
}));
const original =
  "Alex Applicant\nExperience\n• Coordinated team meetings.\n• Prepared monthly management reports using Excel and financial analysis.";
const cv: CvDocument = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  user_id: state.user.id,
  storage_path: state.user.id + "/cv.txt",
  original_filename: "cv.txt",
  mime_type: "text/plain",
  byte_size: 120,
  text_content: original,
  created_at: "2026-10-10T00:00:00Z",
};
function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}
function mount(url = "/dashboard") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Workspace />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.fail = false;
  state.data = {
    cvs: [],
    packs: [],
    applications: [],
    entitlementError: null,
    entitlement: {
      creditsRemaining: 1,
      expiresAt: null,
      billingConfigured: false,
      billingMode: null,
    },
  };
  calls.extract.mockResolvedValue(original);
  calls.upload.mockImplementation(async () => {
    state.data.cvs.push(cv);
    return cv;
  });
  calls.download.mockResolvedValue(undefined);
  calls.original.mockResolvedValue(undefined);
});
describe("Real workspace journey and truthful failures", () => {
  it("shows an honest zero state and persists a manually reported application status", async () => {
    mount("/dashboard?tab=tracker");
    await screen.findByText(
      "No applications recorded yet. Add one above or save an approved CV pack.",
    );
    expect(
      screen.queryByText(/280|Software Engineer|85%/),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Job title"), {
      target: { value: "FP&A Analyst" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save application" }));
    await screen.findByText("Application saved.");
    expect(state.data.applications).toHaveLength(1);
    expect(state.data.applications[0].status).toBe("saved");
    fireEvent.change(screen.getByLabelText("Status for FP&A Analyst"), {
      target: { value: "applied" },
    });
    await screen.findByText("Application status saved.");
    expect(state.data.applications[0].status).toBe("applied");
  });
  it("requires actual file review, then approval before document export", async () => {
    mount();
    await screen.findByText("No source CVs saved in this workspace. Manage CVs for your scheduled search in Job Loop.");
    expect(screen.getByRole('heading', { name: 'Your saved CVs.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Job Loop/ })).toHaveAttribute('href', '/loop');
    expect(screen.getByRole('link', { name: /Start a CV Check/ })).toHaveAttribute('href', '/check');
    expect(screen.queryByText('Your experience starts here.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose CV file"), {
      target: {
        files: [new File([original], "cv.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("Review the extracted text, then save your CV.");
    fireEvent.click(screen.getByRole("button", { name: "Save reviewed CV" }));
    await screen.findByText(
      "CV saved privately. You can now tailor it for a vacancy.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tailor this CV" }));
    fireEvent.change(screen.getByLabelText("Job title"), {
      target: { value: "FP&A Analyst" },
    });
    fireEvent.change(screen.getByLabelText("Job description"), {
      target: {
        value:
          "Prepare monthly financial management reports, reporting and financial analysis. Use Excel to support budgeting and forecasting.",
      },
    });
    calls.create.mockImplementation(async (input) => {
      const pack: ApplicationPack = {
        id: "pack1",
        user_id: state.user.id,
        resume_id: cv.id,
        request_id: input.requestId,
        job_title: input.jobTitle,
        company: "",
        job_url: null,
        job_description: input.jobDescription,
        original_text: original,
        tailored_text: original,
        matched_keywords: ["financial", "reports", "Excel"],
        missing_keywords: ["forecasting"],
        status: "draft",
        created_at: "2026-10-10T00:00:00Z",
      };
      state.data.packs.push(pack);
      state.data.entitlement!.creditsRemaining = 0;
      return pack;
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare application pack" }),
    );
    await screen.findByText("Review: FP&A Analyst");
    expect(
      screen.queryByRole("button", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & save version" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve & save version" }),
    );
    await screen.findByText("Reviewed version approved and saved.");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() =>
      expect(calls.download).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved" }),
        "pdf",
      ),
    );
  });
  it("shows a load error rather than fabricated jobs or success counters", async () => {
    state.fail = true;
    mount();
    await screen.findByText("Your saved records could not be loaded.");
    expect(screen.queryByText("Packs remaining")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/280|Software Engineer|85%/),
    ).not.toBeInTheDocument();
  });
  it("never grants paid capacity from the checkout success URL", async () => {
    mount("/dashboard?tab=billing&checkout=success");
    await screen.findByText(/Checkout returned/);
    expect(state.data.entitlement!.creditsRemaining).toBe(1);
    expect(calls.checkout).not.toHaveBeenCalled();
    expect(calls.openCheckout).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /buy|checkout/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check a CV for free' })).toHaveAttribute('href', '/check');
  });
  it("removes a buyer email that a payment provider appends to the return URL", async () => {
    mount("/dashboard?tab=billing&checkout=success&payment_id=pay_fixture&status=succeeded&email=buyer%40example.invalid");
    await screen.findByText(/Checkout returned/);
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).not.toContain("email"));
    expect(screen.getByTestId("location-search").textContent).toContain("checkout=success");
    expect(screen.getByTestId("location-search").textContent).not.toContain("example.invalid");
  });
  it("saves in-progress notes and date when the status changes", async () => {
    state.data.applications.push({ id: 'track1', user_id: state.user.id, pack_id: null, job_title: 'Analyst', company: '', job_url: null, status: 'saved', notes: '', applied_at: null, follow_up_at: null, created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z' });
    mount('/dashboard?tab=tracker');
    await screen.findByText('Analyst');
    fireEvent.change(screen.getByLabelText('Notes'), {target:{value:'Ask about the interview format'}});
    fireEvent.change(screen.getByLabelText('Follow-up date'), {target:{value:'2026-10-15'}});
    fireEvent.change(screen.getByLabelText('Status for Analyst'), {target:{value:'interview'}});
    await screen.findByText('Application status saved.');
    expect(state.data.applications[0]).toMatchObject({notes:'Ask about the interview format',follow_up_at:'2026-10-15T12:00:00.000Z',status:'interview'});
    expect(screen.getByLabelText('Notes')).toHaveValue('Ask about the interview format');
  });
  it("keeps saved CV controls usable while pack access is unavailable", async () => {
    state.data.cvs = [cv];
    state.data.entitlement = null;
    state.data.entitlementError = 'Pack access could not be checked.';
    mount();
    await screen.findByText('cv.txt');
    expect(screen.getByRole('button', {name:'Original'})).toBeEnabled();
    expect(screen.getByRole('button', {name:'Tailor this CV'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Tailor this CV'}));
    expect(screen.getByRole('button',{name:'Prepare application pack'})).toBeDisabled();
  });
  it.each(['stripe', 'paddle'] as const)('does not expose checkout even when the backend reports %s billing ready', async provider => {
    state.data.entitlement = {creditsRemaining:0,expiresAt:null,billingConfigured:true,billingMode:'live',paymentProvider:provider};
    mount('/dashboard?tab=billing');
    await screen.findByText('Job Loop from $29 a month: your job search on a schedule. CV Check is free to start, with optional one-time passes.');
    expect(screen.getByRole('button', {name:'Plan & allowance'})).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', {name:'Check a CV for free'})).toHaveAttribute('href', '/check');
    expect(screen.getByText(/0 saved preparations available/)).toHaveTextContent('Previously approved documents remain available to download.');
    expect(screen.queryByRole('button', {name:/buy|checkout|purchase|subscribe|payment/i})).not.toBeInTheDocument();
    expect(screen.queryByText(/Ten application packs for 30 days/)).not.toBeInTheDocument();
    expect(calls.checkout).not.toHaveBeenCalled();
    expect(calls.openCheckout).not.toHaveBeenCalled();
  });
  it.each(['zero', 'unavailable'] as const)('keeps original files, approved downloads and tracking usable with %s preparation access', async access => {
    state.data.cvs = [cv];
    state.data.entitlement = access === 'zero' ? {creditsRemaining:0,expiresAt:null,billingConfigured:true,billingMode:'live',paymentProvider:'stripe'} : null;
    state.data.entitlementError = access === 'unavailable' ? 'Pack access could not be checked.' : null;
    state.data.packs = [{
      id:'approved-pack',user_id:state.user.id,resume_id:cv.id,request_id:'original-request',
      job_title:'Saved role',company:'Example employer',job_url:null,job_description:'Saved vacancy description',
      original_text:original,tailored_text:original,matched_keywords:[],missing_keywords:[],status:'approved',created_at:'2026-10-10T00:00:00Z',
    }];
    state.data.applications = [{
      id:'saved-application',user_id:state.user.id,pack_id:'approved-pack',job_title:'Recorded application',company:'Example employer',job_url:null,
      status:'saved',notes:'Existing private note',applied_at:null,follow_up_at:null,created_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:00:00Z',
    }];
    mount();
    const originalDownload = await screen.findByRole('button', {name:'Original'});
    expect(originalDownload).toBeEnabled();
    fireEvent.click(originalDownload);
    await waitFor(() => expect(calls.original).toHaveBeenCalledWith(expect.objectContaining({id:cv.id})));
    await waitFor(() => expect(screen.getByRole('button', {name:'Tailor this CV'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name:'Tailor this CV'}));
    expect(screen.getByRole('button', {name:'Prepare application pack'})).toBeDisabled();
    expect(screen.getByRole('link', {name:'Check a CV for free'})).toHaveAttribute('href', '/check');
    expect(screen.getByText(/Your saved documents are still available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:/Saved role.*Approved — open & download/}));
    await screen.findByText('Review: Saved role');
    expect(screen.getByRole('button', {name:'Download PDF'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button', {name:'Download PDF'}));
    await waitFor(() => expect(calls.download).toHaveBeenCalledWith(expect.objectContaining({id:'approved-pack',status:'approved'}), 'pdf'));
    await waitFor(() => expect(screen.getByRole('button', {name:'Application tracker'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name:'Application tracker'}));
    await screen.findByText('Recorded application');
    expect(screen.getByLabelText('Notes')).toHaveValue('Existing private note');
    expect(screen.getByRole('button', {name:'Save application'})).toBeEnabled();
    expect(calls.create).not.toHaveBeenCalled();
    expect(calls.checkout).not.toHaveBeenCalled();
    expect(calls.openCheckout).not.toHaveBeenCalled();
  });
});
