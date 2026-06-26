import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Camera, ChevronRight, HardDrive, Home, Plus, Search } from "lucide-react";
import { usePersonalStoragePermission } from "../../../hooks/usePersonalStoragePermission";
import { usePersonalLibrary } from "../../../hooks/usePersonalLibrary";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { folderDB } from "../../../lib/personalLibraryDB";
import { fmtBytes } from "../../../lib/personalLibraryQuota";
import { addFileToFolder, getOrCreateFolder, type ItemSort } from "../../../services/personalLibrary";
import { pickPhoto } from "../../../lib/native/camera";
import PersonalLibraryGate from "./PersonalLibraryGate";
import FolderGrid from "./FolderGrid";
import FolderView from "./FolderView";
import { Input } from "../../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Button } from "../../ui/button";
import { toast } from "sonner";

const SORT_KEY = "nb_pl_sort";
const PATH_KEY = "nb_pl_path"; // persists last-opened folder trail (id[])
const SORT_LABEL: Record<ItemSort, string> = {
  manual: "Custom order",
  name: "Name A→Z",
  newest: "Newest first",
  largest: "Largest first",
};

export default function MyLibrary() {
  const { allowed, allow } = usePersonalStoragePermission();
  const rootFileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<PersonalFolder[]>([]);
  const pathRestoredRef = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ItemSort>(() => {
    try {
      const v = localStorage.getItem(SORT_KEY) as ItemSort | null;
      return v && v in SORT_LABEL ? v : "manual";
    } catch {
      return "manual";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort);
    } catch {
      /* ignore */
    }
  }, [sort]);

  // Persist breadcrumb trail to localStorage → reopens last folder on revisit.
  // Save: whenever path changes (after first restore).
  useEffect(() => {
    if (!pathRestoredRef.current) return;
    try {
      localStorage.setItem(PATH_KEY, JSON.stringify(path.map((f) => f.id)));
    } catch {
      /* ignore */
    }
  }, [path]);

  // Restore: on first mount (once folders are loadable), walk saved ids and
  // rebuild the PersonalFolder trail. Silently drops any deleted nodes.
  useEffect(() => {
    if (pathRestoredRef.current) return;
    let alive = true;
    (async () => {
      try {
        const raw = localStorage.getItem(PATH_KEY);
        if (!raw) {
          pathRestoredRef.current = true;
          return;
        }
        const ids: string[] = JSON.parse(raw);
        const trail: PersonalFolder[] = [];
        for (const id of ids) {
          const r = await folderDB.get(id);
          if (!r) break;
          trail.push(r);
        }
        if (alive && trail.length) setPath(trail);
      } catch {
        /* ignore */
      } finally {
        pathRestoredRef.current = true;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currentId = path.length ? path[path.length - 1].id : null;

  const {
    folders,
    allFolders,
    used,
    cap,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    reorderFolder,
    refresh,
  } = usePersonalLibrary(currentId);

  useEffect(() => {
    if (!path.length) return;
    let alive = true;
    (async () => {
      const fresh: PersonalFolder[] = [];
      for (const node of path) {
        const r = await folderDB.get(node.id);
        if (!r) break;
        fresh.push(r);
      }
      if (alive && fresh.length !== path.length) setPath(fresh);
    })();
    return () => {
      alive = false;
    };
  }, [allFolders, path]);

  const visibleFolders = useMemo(() => {
    if (!query.trim()) return folders;
    const q = query.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, query]);

  if (!allowed) return <PersonalLibraryGate onAllow={allow} />;

  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const nearFull = pct >= 80;

  const handleRootPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    try {
      const targetFolder = path.length ? path[path.length - 1] : await getOrCreateFolder("General");
      // Use the batch importer — it dedupes, runs serially through the write
      // queue, inserts a 120 ms GC breather between files, and surfaces
      // per-file skip/fail reasons instead of crashing the whole batch on
      // a single low-memory file.
      const { addFilesToFolder } = await import("../../../services/personalLibrary");
      const res = await addFilesToFolder(targetFolder.id, files);
      const added = res.added.length;
      const skipped = res.skipped.length;
      const failed = res.failed.length;
      if (added && !skipped && !failed) {
        toast.success(added === 1 ? `Added "${res.added[0].title}"` : `Added ${added} files`);
      } else if (added) {
        toast.success(`Added ${added}${skipped ? ` · skipped ${skipped}` : ""}${failed ? ` · failed ${failed}` : ""}`);
      } else if (failed) {
        toast.error(res.failed[0].error || "Import failed");
      } else if (skipped) {
        toast(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} (duplicate or too large)`);
      }
      await refresh();
      if (!path.length) setPath([targetFolder]);
    } catch (err) {
      toast.error((err as Error)?.message || "Could not add file");
    }
  };

  const handleCameraCapture = async () => {
    try {
      const file = await pickPhoto("camera");
      if (!file) return;
      const targetFolder = path.length ? path[path.length - 1] : await getOrCreateFolder("General");
      // Rename to a friendlier scan-style name.
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const renamed = new File([file], `Scan_${ts}.jpg`, { type: file.type || "image/jpeg" });
      await addFileToFolder(targetFolder.id, renamed);
      toast.success("Scan saved");
      await refresh();
      if (!path.length) setPath([targetFolder]);
    } catch (err) {
      toast.error((err as Error)?.message || "Camera unavailable");
    }
  };


  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" />
          {fmtBytes(used)} of {fmtBytes(cap)} used
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${nearFull ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {nearFull && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
            Storage is almost full. Delete files you no longer need to keep the app fast.
          </p>
        )}
      </div>

      {/* Search + sort — minimal toolbar; primary add actions live in the bottom pill FAB */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Search folders & files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 shrink-0" aria-label={`Sort: ${SORT_LABEL[sort]}`}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">{SORT_LABEL[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABEL) as ItemSort[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => setSort(k)}>
                {SORT_LABEL[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={rootFileRef}
          type="file"
          accept="application/pdf,.pdf,.md,.markdown,text/markdown,text/plain,.txt,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,image/*"
          multiple
          className="hidden"
          onChange={handleRootPick}
        />
      </div>


      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 overflow-x-auto text-xs scrollbar-none">
        <button
          type="button"
          onClick={() => setPath([])}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
            path.length === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Home className="h-3 w-3" /> My Library
        </button>
        {path.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setPath(path.slice(0, i + 1))}
              className={`max-w-[120px] truncate rounded-md px-2 py-1 ${
                i === path.length - 1
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              title={f.name}
            >
              {f.name}
            </button>
          </span>
        ))}
        {path.length > 0 && (
          <span className="ml-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" aria-label="Items in this folder">
            {visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}
          </span>
        )}
      </nav>

      <FolderGrid
        hideWhenEmpty={!!currentId}
        title={path.length ? "Folders" : "My folders"}
        folders={visibleFolders}
        onOpen={(f) => setPath([...path, f])}
        onCreate={async (name, color) => {
          await createFolder(name, currentId, color);
        }}
        onCreateInside={async (parentId, name, color) => {
          await createFolder(name, parentId, color);
        }}
        onRename={renameFolder}
        onDelete={deleteFolder}
        onMove={async (id, newParent) => {
          await moveFolder(id, newParent);
        }}
        onReorder={reorderFolder}
        moveTargets={allFolders}
      />

      {currentId && (
        <FolderView
          folder={path[path.length - 1]}
          allFolders={allFolders}
          onRefreshOuter={refresh}
          sort={sort}
          view="list"
        />
      )}

      {!path.length && !visibleFolders.length && !query && (
        <p className="text-center text-xs text-muted-foreground px-4">
          Your private library. Create folders, drop in PDFs from your phone, reorder and move them like a file manager. Files never leave this device.
        </p>
      )}

      {/* Centered split FAB — mirrors the Doc-Scanner "Camera | +" pill.
          Camera scans straight to the current folder; + opens the file picker. */}
      <div
        className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="pointer-events-auto inline-flex h-14 items-stretch overflow-hidden rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ring-1 ring-primary/30">
          <button
            type="button"
            onClick={handleCameraCapture}
            aria-label="Scan with camera"
            className="inline-flex w-20 items-center justify-center transition-colors active:bg-primary/80"
          >
            <Camera className="h-6 w-6" strokeWidth={2} />
          </button>
          <span aria-hidden className="my-3 w-px bg-primary-foreground/40" />
          <button
            type="button"
            onClick={() => rootFileRef.current?.click()}
            aria-label="Add files from device"
            className="inline-flex w-20 items-center justify-center transition-colors active:bg-primary/80"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
