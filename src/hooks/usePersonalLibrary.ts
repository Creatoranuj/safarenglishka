import { useCallback, useEffect, useState } from "react";
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

export function usePersonalLibrary(parent_id: string | null = null) {
  const [folders, setFolders] = useState<PersonalFolder[]>([]);
  const [allFolders, setAllFolders] = useState<PersonalFolder[]>([]);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [f, all, u] = await Promise.all([
      listFolders(parent_id),
      listAllFolders(),
      getUsedBytes(),
    ]);
    setFolders(f);
    setAllFolders(all);
    setUsed(u);
    setLoading(false);
  }, [parent_id]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("personalLibrary:refresh", handler);
    return () => window.removeEventListener("personalLibrary:refresh", handler);
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
      return f;
    },
    renameFolder: async (id: string, name: string) => {
      await renameFolder(id, name);
      await refresh();
    },
    deleteFolder: async (id: string) => {
      await deleteFolder(id);
      await refresh();
    },
    moveFolder: async (id: string, new_parent_id: string | null) => {
      await moveFolder(id, new_parent_id);
      await refresh();
    },
    reorderFolder: async (id: string, dir: "up" | "down") => {
      await reorderFolder(id, dir);
      await refresh();
    },
  };
}

export function useFolderItems(folder_id: string | null, sort: ItemSort = "manual") {
  const [items, setItems] = useState<PersonalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!folder_id) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await listItems(folder_id, sort));
    } catch (e) {
      reportError(e, { surface: "useFolderItems.listItems", folder_id });
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [folder_id, sort]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    loading,
    error,
    refresh,
    addFile: async (file: File) => {
      if (!folder_id) return;
      await addFileToFolder(folder_id, file);
      await refresh();
    },
    deleteItem: async (id: string) => {
      await deleteItem(id);
      await refresh();
    },
    moveItem: async (id: string, new_folder_id: string) => {
      await moveItem(id, new_folder_id);
      await refresh();
    },
    renameItem: async (id: string, title: string) => {
      await renameItem(id, title);
      await refresh();
    },
    replaceItem: async (id: string, file: File) => {
      await replaceItem(id, file);
      await refresh();
    },
    duplicateItem: async (id: string, target_folder_id?: string) => {
      await duplicateItem(id, target_folder_id);
      await refresh();
    },
    reorderItem: async (id: string, dir: "up" | "down") => {
      await reorderItem(id, dir);
      await refresh();
    },
    exportItem: (id: string) => exportItem(id),
    getItemUri,
  };
}
