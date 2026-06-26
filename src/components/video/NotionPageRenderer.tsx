import { lazy, Suspense, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { extractNotionPageId, notionPageProxyUrl } from "../../lib/pdfViewerUrl";
import { openExternal } from "../../lib/native/browser";

// react-notion-x is heavy (~150KB gz with prism + katex). Lazy-load so the
// main bundle isn't impacted for users who never open a Notion page.
const NotionRenderer = lazy(() =>
  import("react-notion-x").then((m) => ({ default: m.NotionRenderer }))
);

// react-notion-x base CSS — required for layout/typography of the rendered page.
import "react-notion-x/src/styles.css";

interface Props {
  url: string;
  title?: string;
}

/**
 * In-app Notion page renderer.
 * - Extracts page id from notion.site / notion.so URL
 * - Fetches recordMap via Supabase edge function `notion-page` (JSON proxy)
 * - Renders natively with react-notion-x — full text, images, links, rich formatting
 * - Falls back to "Open in Browser" card on any failure
 */
export default function NotionPageRenderer({ url, title }: Props) {
  const pageId = extractNotionPageId(url);
  const [recordMap, setRecordMap] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pageId) {
      setError("Could not extract page id");
      return;
    }
    let cancelled = false;
    setError(null);
    setRecordMap(null);

    fetch(notionPageProxyUrl(pageId))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRecordMap(data.recordMap);
        // Signal DocumentReader's loading/error watchdog — otherwise the
        // 25s "Couldn't load the document" overlay fires even on success.
        try { window.dispatchEvent(new CustomEvent("pdf-ready")); } catch {}
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e?.message || "Failed to load";
        setError(msg);
        try { window.dispatchEvent(new CustomEvent("pdf-error", { detail: msg })); } catch {}
      });


    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (error) {
    return <FallbackCard url={url} title={title} reason={error} />;
  }

  if (!recordMap) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading Notion page…</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-background notion-app-wrapper">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Rendering…</div>}>
        <NotionRenderer
          recordMap={recordMap}
          fullPage={false}
          darkMode={false}
          disableHeader
          // Override missing components so react-notion-x doesn't emit the
          // "using empty component Code/Equation/..." warnings and so that
          // code blocks still render readable text in-app (we don't ship
          // prismjs/katex to keep the bundle small).
          components={{
            Code: ({ block }: { block: { properties?: { title?: unknown[][] } } }) => {
              const text = (block?.properties?.title || [])
                .map((t) => (Array.isArray(t) ? t[0] : ""))
                .join("");
              return (
                <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                  <code>{text}</code>
                </pre>
              );
            },
            Equation: ({ block }: { block: { properties?: { title?: unknown[][] } } }) => {
              const text = (block?.properties?.title || [])
                .map((t) => (Array.isArray(t) ? t[0] : ""))
                .join("");
              return <code className="rounded bg-muted px-1 py-0.5 text-xs">{text}</code>;
            },
            // Subpage links inside a Notion page → open in browser instead
            // of trying to navigate inside the in-app renderer (which would
            // require us to refetch a new recordMap).
            PageLink: ({ href, children, ...rest }: any) => (
              <a
                {...rest}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  try { openExternal(href); } catch { window.open(href, "_blank", "noopener,noreferrer"); }
                }}
              >
                {children}
              </a>
            ),
          }}
        />
      </Suspense>
      {/* In-app safety: clamp huge images, respect theme */}
      <style>{`
        .notion-app-wrapper .notion { padding: 1rem 1rem 4rem; max-width: 100%; }
        .notion-app-wrapper .notion-page { padding: 0 !important; max-width: 100% !important; }
        .notion-app-wrapper img { max-width: 100%; height: auto; }
        .notion-app-wrapper .notion-asset-wrapper { max-width: 100% !important; }
        .notion-app-wrapper a { color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}

function FallbackCard({ url, title, reason }: { url: string; title?: string; reason: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.06] ring-1 ring-border">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-foreground" fill="none" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 9v6m0-6l5 6m0-6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold leading-tight text-foreground">{title || "Notion Page"}</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          In-app preview unavailable ({reason}). Open in browser for full content.
        </p>
      </div>
      <button
        type="button"
        onClick={() => openExternal(url)}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-4 w-4" />
        Open Notion Page
      </button>
    </div>
  );
}
