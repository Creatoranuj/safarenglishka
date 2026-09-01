import { FolderOpen } from "lucide-react";
import type { ViewMode } from "./ContentViewSwitcher";

export interface ChapterFolder {
  id: string;
  code: string;
  title: string;
  lessonCount: number;
  dppCount?: number;
  thumbnailUrl?: string | null;
}

interface ChapterFolderViewsProps {
  folders: ChapterFolder[];
  view: ViewMode;
  onOpen: (folder: ChapterFolder) => void;
}

/**
 * Renders chapter "folders" in the view the user picked in ContentViewSwitcher.
 * Shared by ChapterView (subject list) and LectureListing (sub-chapter list) so
 * the switcher behaves identically at every depth of the drill-down.
 */
export const ChapterFolderViews = ({ folders, view, onOpen }: ChapterFolderViewsProps) => {
  if (view === "gallery") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => onOpen(f)}
            className="text-left rounded-xl border border-border bg-card p-3 [@media(hover:hover)]:hover:shadow-md [@media(hover:hover)]:hover:border-primary/40 transition-all"
          >
            <div className="aspect-video rounded-lg bg-muted mb-2 overflow-hidden flex items-center justify-center">
              {f.thumbnailUrl ? (
                <img src={f.thumbnailUrl} alt={f.title} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <FolderOpen className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs font-semibold text-foreground line-clamp-2">{f.title}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {f.lessonCount} lectures{typeof f.dppCount === "number" ? ` · ${f.dppCount} DPPs` : ""}
            </p>
          </button>
        ))}
      </div>
    );
  }

  if (view === "table") {
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Chapter</th>
              <th className="px-3 py-2 text-right">Lectures</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr
                key={f.id}
                onClick={() => onOpen(f)}
                className="border-t border-border cursor-pointer [@media(hover:hover)]:hover:bg-accent/30"
              >
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.code}</td>
                <td className="px-3 py-2 font-medium text-foreground">{f.title}</td>
                <td className="px-3 py-2 text-right">{f.lessonCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {folders.map((f) => (
        <button
          key={f.id}
          onClick={() => onOpen(f)}
          className="w-full p-3 min-h-[44px] border rounded-xl bg-card [@media(hover:hover)]:hover:border-primary [@media(hover:hover)]:hover:shadow-sm transition-all text-left group flex items-center gap-3"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary [@media(hover:hover)]:group-hover:bg-primary [@media(hover:hover)]:group-hover:text-primary-foreground transition-colors">
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{f.code} : {f.title}</p>
            <p className="text-xs text-muted-foreground">{f.lessonCount} lectures</p>
          </div>
        </button>
      ))}
    </div>
  );
};
