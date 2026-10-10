import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), list: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/cv-database", () => ({ mvpSupabase: {
  auth: { getUser: mocks.getUser }, storage: { from: mocks.from },
} }));
import { listLegacyCvs, downloadLegacyCv, type LegacyCvRecord } from "@/lib/cv-legacy";
const record: LegacyCvRecord = { id: "file-id", storage_path: "owner/old.pdf", original_filename: "old.pdf", created_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.from.mockReturnValue({ list: mocks.list, download: mocks.download });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.download.mockResolvedValue({ data: new Blob(["old CV"], { type: "application/pdf" }), error: null });
});

describe("read-only legacy CV import", () => {
  it("lists the authenticated owner folder and preserves unknown dates honestly", async () => {
    mocks.list.mockResolvedValue({ data: [
      { id: "file-id", name: "old.pdf", created_at: null },
      { id: "doc-id", name: "earlier.doc", created_at: "2025-09-01T10:00:00Z" },
      { id: null, name: "folder" },
      { id: "notes", name: "image.png" },
      { id: "unsafe", name: "../other.pdf" },
    ], error: null });
    const files = await listLegacyCvs("owner");
    expect(files).toEqual([record, { id: "doc-id", storage_path: "owner/earlier.doc", original_filename: "earlier.doc", created_at: "2025-09-01T10:00:00Z" }]);
    expect(mocks.from).toHaveBeenCalledWith("jobassist");
    expect(mocks.list).toHaveBeenCalledWith("owner", { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
  });
  it("paginates beyond 100 real files instead of silently truncating", async () => {
    mocks.list.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ id: `id-${index}`, name: `CV-${index}.txt`, created_at: null })), error: null })
      .mockResolvedValueOnce({ data: [{ id: "last", name: "last.docx", created_at: "invalid" }], error: null });
    const files = await listLegacyCvs("owner");
    expect(files).toHaveLength(101);
    expect(files[100].created_at).toBeNull();
    expect(mocks.list.mock.calls[1][1].offset).toBe(100);
  });
  it("rejects account mismatch and expired authentication before accessing storage", async () => {
    await expect(listLegacyCvs("other")).rejects.toThrow("own account");
    await expect(downloadLegacyCv(record, "other")).rejects.toThrow("own account");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(listLegacyCvs("owner")).rejects.toThrow("sign in");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects malformed folders, traversal, nested and foreign file paths", async () => {
    await expect(listLegacyCvs("owner/other")).rejects.toThrow("invalid");
    for (const invalid of [
      { ...record, storage_path: "other/old.pdf" },
      { ...record, storage_path: "owner/nested/old.pdf" },
      { ...record, storage_path: "owner/../old.pdf", original_filename: "../old.pdf" },
      { ...record, storage_path: "owner/old.exe", original_filename: "old.exe" },
    ]) await expect(downloadLegacyCv(invalid, "owner")).rejects.toThrow("invalid");
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("returns a named local File without deleting or writing any metadata", async () => {
    const file = await downloadLegacyCv(record, "owner");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("old.pdf");
    expect(file.type).toBe("application/pdf");
    expect(mocks.download).toHaveBeenCalledWith("owner/old.pdf");
  });
  it("propagates storage failures and does not replace them with invented records", async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(listLegacyCvs("owner")).rejects.toThrow("not been changed");
    mocks.download.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(downloadLegacyCv(record, "owner")).rejects.toThrow("not been changed");
  });
});
