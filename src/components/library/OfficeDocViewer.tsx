import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Loader2 } from "lucide-react";
import { officeDocKind, officeProxyUrl } from "../../lib/pdfViewerUrl";

/**
 * Client-side Office document renderer (docx / xlsx / pptx).
 *
 * Why client-side: the edge runtime has no LibreOffice, so a server-side
 * conversion to PDF is not available. Every modern Office file is a ZIP of
 * XML, which mammoth (docx), exceljs (xlsx) and pptx-preview (pptx) can parse
 * directly in the browser — no third-party viewer, works offline-ish and in
 * the APK WebView where `view.officeapps.live.com` is frequently blocked.
 *
 * Bytes are fetched directly first (Supabase storage / signed Notion S3 URLs
 * send CORS headers) and fall back to the authenticated `pdf-proxy?kind=office`
 * byte relay for CDNs that don't.
 */

type Kind = ReturnType<typeof officeDocKind>;

// Low-RAM Android WebViews OOM well before the browser does. A 40MB Office
// file expands to hundreds of MB of DOM/canvas once rendered, so refuse it
// up-front with an actionable message instead of taking the app down.
const MAX_BYTES = 40 * 1024 * 1024;

async function fetchBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const direct = await fetch(url, { signal }).catch(() => null);
  if (direct?.ok) return await direct.arrayBuffer();
  const res = await fetch(officeProxyUrl(url), { signal });
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.clone().json()) as { error?: string })?.error ?? ""; } catch { /* non-JSON */ }
    throw new Error(detail || `Could not download this file (HTTP ${res.status}).`);
  }
  return await res.arrayBuffer();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

async function renderDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  return value;
}

async function renderXlsx(buf: ArrayBuffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const parts: string[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      // `row.values` is 1-indexed with a leading hole.
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      for (const raw of values) {
        const v = raw as unknown;
        const obj = (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null);
        const text =
          v == null ? "" :
          v instanceof Date ? v.toLocaleDateString() :
          obj && "text" in obj ? String(obj.text) :
          obj && "result" in obj ? String(obj.result ?? "") :
          obj && "richText" in obj
            ? (obj.richText as { text?: string }[] | undefined)?.map((r) => r.text ?? "").join("") ?? ""
            : String(v);
        cells.push(`<${rowNumber === 1 ? "th" : "td"}>${escapeHtml(text)}</${rowNumber === 1 ? "th" : "td"}>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    });
    parts.push(
      `<section class="office-sheet"><h2>${escapeHtml(sheet.name)}</h2><div class="office-table-wrap"><table>${rows.join("")}</table></div></section>`,
    );
  });
  return parts.join("") || "<p>This spreadsheet is empty.</p>";
}

interface Props {
  url: string;
  filename?: string;
  title?: string;
}

export default function OfficeDocViewer({ url, filename, title }: Props) {
  const kind: Kind = officeDocKind(`${filename || ""} ${url}`) ?? officeDocKind(url);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const slideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const slideHost = slideRef.current;
    setHtml(null);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        if (kind === "legacy" || !kind) {
          throw new Error(
            "Legacy Office formats (.doc, .xls, .ppt) can't be previewed in-app. Download the file or re-save it as .docx / .xlsx / .pptx.",
          );
        }
        const buf = await fetchBytes(url, controller.signal);
        if (cancelled) return;
        if (buf.byteLength > MAX_BYTES) {
          throw new Error(
            "This file is too large to preview in the app. Please download it instead.",
          );
        }
        if (kind === "docx") {
          setHtml(DOMPurify.sanitize(await renderDocx(buf)));
        } else if (kind === "xlsx") {
          setHtml(DOMPurify.sanitize(await renderXlsx(buf), { ADD_ATTR: ["class"] }));
        } else {
          const { init } = await import("pptx-preview");
          const host = slideRef.current;
          if (!host || cancelled) return;
          host.innerHTML = "";
          const width = Math.min(host.clientWidth || 960, 1280);
          const previewer = init(host, { width, height: Math.round((width * 9) / 16) });
          await previewer.preview(buf);
        }
      } catch (e) {
        if (cancelled || (e as { name?: string })?.name === "AbortError") return;
        setError((e as Error)?.message || "Could not open this document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // Release the pptx canvases immediately — leaving them attached keeps
      // tens of MB alive until GC, which is the classic OOM path on low-RAM
      // Android after opening several decks in one session.
      if (slideHost) slideHost.innerHTML = "";
    };
  }, [url, kind]);

  return (
    <div className="h-full w-full overflow-auto bg-background">
      {loading && (
        <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening {title || filename || "document"}…
        </div>
      )}
      {!loading && error && (
        <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}
      {html && (
        <div
          className="office-doc mx-auto max-w-3xl px-4 py-6 text-foreground"
          // Sanitized above with DOMPurify.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <div ref={slideRef} className={kind === "pptx" && !error ? "flex flex-col items-center gap-4 p-4" : "hidden"} />
      <style>{`
        .office-doc { line-height: 1.7; }
        .office-doc h1, .office-doc h2, .office-doc h3 { font-weight: 700; margin: 1.1em 0 .5em; }
        .office-doc h1 { font-size: 1.5rem; } .office-doc h2 { font-size: 1.25rem; }
        .office-doc p { margin: .6em 0; }
        .office-doc ul, .office-doc ol { margin: .6em 0 .6em 1.25em; list-style: revert; }
        .office-doc img { max-width: 100%; height: auto; border-radius: .5rem; }
        .office-doc table { border-collapse: collapse; width: 100%; font-size: .8rem; }
        .office-doc th, .office-doc td { border: 1px solid hsl(var(--border)); padding: .35rem .5rem; text-align: left; white-space: pre-wrap; }
        .office-doc th { background: hsl(var(--muted)); font-weight: 600; }
        .office-doc .office-table-wrap { overflow-x: auto; }
        .office-doc .office-sheet { margin-bottom: 2rem; }
      `}</style>
    </div>
  );
}