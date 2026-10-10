import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), single: vi.fn(), order: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/cv-database", () => ({ mvpSupabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { deleteFreeCheck, listFreeChecks, saveFreeCheck, FreeCheckSaveUnconfirmedError, type FreeCvCheck, type SaveFreeCheckInput } from "@/lib/free-check-api";

const text = "Alex helped design a procurement pilot across five units with projected savings. Alex created a tracker covering six workstreams and prepared twelve leadership briefings.";
const input: SaveFreeCheckInput = { requestId: "00000000-0000-4000-8000-000000000002", jobTitle: "Strategy Manager", company: "Example Group", jobDescription: "Experience contributing to procurement pilot design, tracking several workstreams and preparing leadership briefings is required.", originalText: text, reviewedText: text, methodVersion: "evidence-v1", approved: true };
const record: FreeCvCheck = { id: "00000000-0000-4000-8000-000000000003", user_id: "owner", request_id: input.requestId, job_title: input.jobTitle, company: input.company, job_description: input.jobDescription, original_text: text, reviewed_text: text, method_version: input.methodVersion, status: "approved", created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.single.mockResolvedValue({ data: record, error: null });
  mocks.order.mockResolvedValue({ data: [record], error: null });
  const chain = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle, insert: mocks.insert, single: mocks.single, order: mocks.order, delete: mocks.delete };
  mocks.from.mockReturnValue(chain);
  for (const method of [mocks.select, mocks.eq, mocks.insert, mocks.delete]) method.mockReturnValue(chain);
});

describe("free CV check account snapshots", () => {
  it("saves only explicitly approved texts and inputs with a stable request reference", async () => {
    await expect(saveFreeCheck("owner", input)).resolves.toEqual(record);
    expect(mocks.from).toHaveBeenCalledWith("cv_checks");
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "owner", request_id: input.requestId, job_title: input.jobTitle, company: input.company, job_description: input.jobDescription, original_text: text, reviewed_text: text, method_version: "evidence-v1", status: "approved" });
    expect(mocks.getUser).toHaveBeenCalledTimes(4);
  });
  it("rejects draft, oversized and invalid job inputs before account calls", async () => {
    for (const invalid of [{ ...input, approved: false }, { ...input, reviewedText: "x".repeat(60001) }, { ...input, originalText: text + " ".repeat(60000) }, { ...input, jobDescription: "short" }, { ...input, requestId: "invalid" }]) await expect(saveFreeCheck("owner", invalid)).rejects.toThrow();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("returns an existing identical snapshot without another insert", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: record, error: null });
    await expect(saveFreeCheck("owner", input)).resolves.toEqual(record);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing request reference with different reviewed text", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: record, error: null });
    await expect(saveFreeCheck("owner", { ...input, reviewedText: `${text} User-added detail.` })).rejects.toThrow("different CV review");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("recovers an owned committed snapshot after the write response is lost", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: record, error: null });
    mocks.single.mockRejectedValue(new TypeError("response lost"));
    await expect(saveFreeCheck("owner", input)).resolves.toEqual(record);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.eq).toHaveBeenCalledWith("request_id", input.requestId);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("reports an unresolved save without removing any data when reconciliation is unavailable", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    mocks.single.mockRejectedValue(new TypeError("response lost"));
    await expect(saveFreeCheck("owner", input)).rejects.toBeInstanceOf(FreeCheckSaveUnconfirmedError);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("blocks another account before reading, inserting or deleting", async () => {
    await expect(saveFreeCheck("other", input)).rejects.toThrow("owner");
    await expect(deleteFreeCheck({ ...record, user_id: "other" })).rejects.toThrow("owner");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not return a previous owner's saved data after an in-flight account switch", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "owner" } }, error: null }).mockResolvedValueOnce({ data: { user: { id: "other" } }, error: null });
    await expect(listFreeChecks("owner")).rejects.toThrow("account changed");
  });
  it("lists actual rows and propagates query failure without fabricated data", async () => {
    await expect(listFreeChecks("owner")).resolves.toEqual([record]);
    mocks.order.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(listFreeChecks("owner")).rejects.toThrow("could not be loaded");
  });
  it("deletes only the owner's selected snapshot", async () => {
    await deleteFreeCheck(record);
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith("id", record.id);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  });
});
