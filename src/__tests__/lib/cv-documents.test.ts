import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CvDocument } from "@/lib/cv-database";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), upload: vi.fn(), remove: vi.fn(), download: vi.fn(),
  from: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), order: vi.fn(), delete: vi.fn(),
  downloadBlob: vi.fn(),
}));
vi.mock("@/lib/cv-database", () => ({ mvpSupabase: {
  auth: { getUser: mocks.getUser },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, download: mocks.download }) },
  from: mocks.from,
} }));
vi.mock("@/lib/document-download", () => ({ downloadBlob: mocks.downloadBlob, safeDocumentFilename: (name: string) => name }));
import { uploadCvDocument, listCvDocuments, deleteCvDocument, downloadOriginalCv, CvSaveUnconfirmedError } from "@/lib/cv-documents";

const text = "A real candidate CV with eight years of product delivery experience, research, stakeholder management and measurable improvements.";
const documentId = "00000000-0000-4000-8000-000000000001";
const cv: CvDocument = { id: documentId, user_id: "owner", storage_path: `owner/${documentId}.txt`, original_filename: "CV.txt", mime_type: "text/plain", byte_size: 130, text_content: text, created_at: "2026-10-10T10:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(documentId);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.upload.mockResolvedValue({ data: { path: cv.storage_path }, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.single.mockResolvedValue({ data: cv, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.order.mockResolvedValue({ data: [cv], error: null });
  const chain = { insert: mocks.insert, select: mocks.select, single: mocks.single, maybeSingle: mocks.maybeSingle, eq: mocks.eq, order: mocks.order, delete: mocks.delete };
  mocks.from.mockReturnValue(chain);
  for (const method of [mocks.insert, mocks.select, mocks.eq, mocks.delete]) method.mockReturnValue(chain);
});

describe("CV persistence and ownership", () => {
  it("stores only reviewed text with a private owner-prefixed file and returns durable metadata", async () => {
    const result = await uploadCvDocument("owner", new File(["original file content"], "CV.txt"), `  ${text}  `);
    expect(result).toEqual(cv);
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^owner\/[^/]+\.txt$/), expect.any(File), { contentType: "text/plain", upsert: false });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: documentId, user_id: "owner", storage_path: cv.storage_path, text_content: text, original_filename: "CV.txt" }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("refuses a different account before writing or downloading any file", async () => {
    await expect(uploadCvDocument("other", new File(["original"], "CV.txt"), text)).rejects.toThrow("own account");
    expect(mocks.upload).not.toHaveBeenCalled();
    await expect(downloadOriginalCv({ ...cv, user_id: "other", storage_path: "other/file.txt" })).rejects.toThrow("own account");
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("does not persist files when authentication has expired", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toThrow("sign in");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("cleans up only after a definite rejection and owned lookup confirms no metadata row", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23514", message: "constraint rejected" } });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toThrow("not completed");
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.eq).toHaveBeenCalledWith("id", documentId);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.eq).toHaveBeenCalledWith("storage_path", cv.storage_path);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
  it("reports cleanup failure instead of hiding an orphan object", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23514", message: "constraint rejected" } });
    mocks.remove.mockResolvedValue({ error: { message: "storage unavailable" } });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toThrow("orphan file");
  });
  it("recovers a committed metadata row after the insert response is lost without removing its file", async () => {
    mocks.single.mockRejectedValue(new TypeError("response lost"));
    mocks.maybeSingle.mockResolvedValue({ data: cv, error: null });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).resolves.toEqual(cv);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves the uploaded object when reconciliation is unavailable and offers list refresh", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "database unreachable" } });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toThrow("Refresh your saved CV list");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves an unresolved in-flight write even if reconciliation currently finds no row", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toBeInstanceOf(CvSaveUnconfirmedError);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves the file if ownership cannot be revalidated before reconciliation", async () => {
    mocks.single.mockRejectedValue(new TypeError("response lost"));
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "owner" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(uploadCvDocument("owner", new File(["original"], "CV.txt"), text)).rejects.toBeInstanceOf(CvSaveUnconfirmedError);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("lists owner rows and propagates query failures instead of fabricating results", async () => {
    await expect(listCvDocuments("owner")).resolves.toEqual([cv]);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    mocks.order.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(listCvDocuments("owner")).rejects.toThrow("could not be loaded");
  });
  it("rejects foreign and traversal storage references before removal", async () => {
    await expect(deleteCvDocument({ ...cv, storage_path: "other/file.txt" })).rejects.toThrow("invalid");
    await expect(deleteCvDocument({ ...cv, storage_path: "owner/../other/file.txt" })).rejects.toThrow("invalid");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("retains metadata when storage deletion fails", async () => {
    mocks.remove.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(deleteCvDocument(cv)).rejects.toThrow("could not be deleted");
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("downloads the authenticated original with its original filename", async () => {
    const blob = new Blob(["original file"]);
    mocks.download.mockResolvedValue({ data: blob, error: null });
    await downloadOriginalCv(cv);
    expect(mocks.download).toHaveBeenCalledWith(cv.storage_path);
    expect(mocks.downloadBlob).toHaveBeenCalledWith(blob, "CV.txt");
  });
});
