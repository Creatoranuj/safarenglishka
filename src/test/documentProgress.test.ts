import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const service = readFileSync(resolve(__dirname, "../services/documentProgress.ts"), "utf8");
const handlers = readFileSync(resolve(__dirname, "../lib/offline/registerHandlers.ts"), "utf8");
const reader = readFileSync(resolve(__dirname, "../components/library/DocReaderShell.tsx"), "utf8");

describe("cross-device PDF reading progress", () => {
  it("writes through the offline queue, never straight to the network", () => {
    expect(service).toContain('enqueueMutation("document_progress.upsert"');
    expect(handlers).toContain('registerMutationHandler("document_progress.upsert"');
    expect(handlers).toContain('onConflict: "user_id,document_key"');
  });

  it("scopes every write to the signed-in user and no-ops when signed out", () => {
    expect(service).toContain("const userId = data.session?.user?.id;");
    expect(service).toContain("if (!userId) return;");
    expect(service).toContain("user_id: userId,");
  });

  it("debounces page moves and flushes on background and close", () => {
    expect(reader).toContain("pageTimer.current = window.setTimeout(");
    expect(reader).toContain("const flushProgress = useCallback");
    expect(reader).toContain('window.addEventListener("app:paused", flushProgress)');
  });

  it("restores the furthest known page across devices", () => {
    expect(reader).toContain("const remote = await fetchDocumentProgress(itemId);");
    expect(reader).toContain("if (remote && remote.page > page) page = remote.page;");
  });

  it("reports an unknown page count as null rather than a fake total", () => {
    expect(service).toContain("total_pages: params.totalPages ?? null,");
    expect(service).toContain("if (!total || total <= 0) return 0;");
  });
});
