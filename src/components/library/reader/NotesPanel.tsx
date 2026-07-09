import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { lazyWithRetry } from "../../../lib/lazyWithRetry";
import { Loader2, Check, Link2 } from "lucide-react";
import { getNote, saveNote, extractWikiLinks } from "../../../services/libraryNotes";

// Markdown editor is heavy — load it only when the notes panel is shown.
// `/nohighlight` drops the Prism+refractor bundle (~215KB gzip).
const MDEditor = lazyWithRetry(() => import("@uiw/react-md-editor/nohighlight"));

interface Props {
  /** Stable id of the item the note belongs to. */
  itemId: string;
  title?: string;
  /** Called when a [[wikilink]] is clicked. */
  onOpenLink?: (name: string) => void;
}

/**
 * Obsidian-style note editor. Auto-saves (debounced 800ms) to IndexedDB and
 * mirrors to MyLibrary/{itemId}/note.md on native devices.
 */
export default function NotesPanel({ itemId, title, onOpenLink }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getNote(itemId).then((md) => {
      if (alive) {
        setValue(md);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [itemId]);

  const onChange = useCallback(
    (next?: string) => {
      const md = next ?? "";
      setValue(md);
      setStatus("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await saveNote(itemId, md);
        setStatus("saved");
        window.setTimeout(() => setStatus("idle"), 1500);
      }, 800);
    },
    [itemId]
  );

  const links = extractWikiLinks(value);

  return (
    <div className="flex h-full flex-col bg-card" data-color-mode="auto">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Notes</p>
          {title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "saved" && <Check className="h-3 w-3 text-green-500" />}
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            <MDEditor
              value={value}
              onChange={onChange}
              height="100%"
              preview="edit"
              visibleDragbar={false}
              textareaProps={{ placeholder: "Write notes… use [[wikilinks]] to connect PDFs" }}
            />
          </Suspense>
        )}
      </div>

      {links.length > 0 && (
        <div className="border-t px-4 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Linked</p>
          <div className="flex flex-wrap gap-1.5">
            {links.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onOpenLink?.(name)}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground hover:bg-accent/80"
              >
                <Link2 className="h-3 w-3" /> {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
