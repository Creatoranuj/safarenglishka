import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "../lib/sentry";
import {
  addFileToFolder,
  createFolder,
  deleteFolder,
  deleteItem,
  duplicateItem,
  exportItem,
  getItemUri,
  listFolders,
  listAllFolders,
  listItems,
  moveFolder,
  moveItem,
  renameFolder,
  renameItem,
  reorderFolder,
  reorderItem,
  replaceItem,
  type ItemSort,
} from "../services/personalLibrary";
import type { PersonalFolder, PersonalItem } from "../lib/personalLibraryDB";
import { getUsedBytes, PERSONAL_LIB_SOFT_CAP_BYTES } from "../lib/personalLibraryQuota";

const REFRESH_EVENT = "personalLibrary:refresh";
const emitRefresh = () => {
  try { window.dispatchEvent(new Event(REFRESH_EVENT)); } catch { /* ssr */ }
};

export function usePersonalLibrary(parent_id: string | null = null) {
  const [folders, setFolders] = useState<PersonalFolder[]>([]);
  const [allFolders, setAllFolders] = useState<PersonalFolder[]>([]);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const [f, all, u] = await Promise.all([
        listFolders(parent_id),
        listAllFolders(),
        getUsedBytes(),
      ]);
      setFolders(f);
      setAllFolders(all);
      setUsed(u);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, [parent_id]);

  useEffect(() => {
    refresh();
    const handler = () => { if (!document.hidden) refresh(); };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [refresh]);

  return {
    folders,
    allFolders,
    loading,
    used,
    cap: PERSONAL_LIB_SOFT_CAP_BYTES,
    refresh,
    createFolder: async (
      name: string,
      parent: string | null = parent_id,
      color: string | null = null
    ) => {
      const f = await createFolder(name, parent, color);
      await refresh();
      emitRefresh();
      return f;
    },
    renameFolder: async (id: string, name: string) => {
      await renameFolder(id, name);
      await refresh();
      emitRefresh();
    },
    deleteFolder: async (id: string) => {
      await deleteFolder(id);
      await refresh();
      emitRefresh();
    },
    moveFolder: async (id: string, new_parent_id: string | null) => {
      await moveFolder(id, new_parent_id);
      await refresh();
      emitRefresh();
    },
    reorderFolder: async (id: string, dir: "up" | "down") => {
      await reorderFolder(id, dir);
      await refresh();
      emitRefresh();
    },
  };
}

export function useFolderItems(folder_id: string | null, sort: ItemSort = "manual") {
  const [items, setItems] = useState<PersonalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!folder_id) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    setError(null);
    try {
      const next = await listItems(folder_id, sort);
      setItems(next);
    } catch (e) {
      reportError(e, { surface: "useFolderItems.listItems", folder_id });
      setError(e as Error);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, [folder_id, sort]);

  useEffect(() => {
    refresh();
    // Cross-mount instant refresh: any add/delete/move anywhere in the app
    // dispatches "personalLibrary:refresh" — pick it up so the grid updates
    // without a manual pull-to-refresh. Skip while backgrounded to avoid
    // wasted IDB reads on Android.
    const handler = () => { if (!document.hidden) refresh(); };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [refresh]);

  return {
    items,
    loading,
    error,
    refresh,
    addFile: async (file: File) => {
      if (!folder_id) return;
      // Optimistic tile so the user sees the file the instant they add it,
      // even before IndexedDB writes settle. Replaced by real record on
      // the refresh() that follows.
      const optimistic: PersonalItem = {
        id: `optimistic-${Date.now()}`,
        folder_id,
        title: file.name.replace(/\.[^.]+$/, ""),
        file_name: file.name,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size,
        local_path: "",
        source: "device",
        added_at: new Date().toISOString(),
        last_opened_at: null,
        sort_index: 0,
      } as unknown as PersonalItem;
      setItems((prev) => [optimistic, ...prev]);
      try {
        await addFileToFolder(folder_id, file);
      } finally {
        await refresh();
        emitRefresh();
      }
    },
    deleteItem: async (id: string) => {
      // Optimistic remove.
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await deleteItem(id);
      } finally {
        await refresh();
        emitRefresh();
      }
    },
    moveItem: async (id: string, new_folder_id: string) => {
      await moveItem(id, new_folder_id);
      await refresh();
      emitRefresh();
    },
    renameItem: async (id: string, title: string) => {
      await renameItem(id, title);
      await refresh();
      emitRefresh();
    },
    replaceItem: async (id: string, file: File) => {
      await replaceItem(id, file);
      await refresh();
      emitRefresh();
    },
    duplicateItem: async (id: string, target_folder_id?: string) => {
      await duplicateItem(id, target_folder_id);
      await refresh();
      emitRefresh();
    },
    reorderItem: async (id: string, dir: "up" | "down") => {
      await reorderItem(id, dir);
      await refresh();
      emitRefresh();
    },
    exportItem: (id: string) => exportItem(id),
    getItemUri,
  };
}
