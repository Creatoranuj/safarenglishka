/**
 * IndexedDB store for the user's Personal Offline Library.
 * Two stores: folders + items. App-local only, never synced.
 *
 * v2: folders gained `parent_id` (nestable folders).
 * v3: items gained `sort_index` for manual reorder (folders already have `position`).
 */

const DB_NAME = "nb_personal_library";
const DB_VERSION = 4;
const FOLDERS = "folders";
const ITEMS = "items";
const FILES = "files"; // web persistence: { id, blob }

export interface PersonalFolder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
  /** null/undefined → root-level folder. */
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalItem {
  id: string;
  folder_id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  local_path: string; // relative path under Filesystem.Directory.Data
  source: "device" | "lesson";
  added_at: string;
  last_opened_at: string | null;
  /** Manual order within a folder. Lower = earlier. */
  sort_index?: number;
}

/** Hole I — cache the connection and react to `versionchange`. If another
 *  tab/instance triggers a schema upgrade while an import is mid-flight, we
 *  close our handle so the upgrade can proceed and re-open on the next
 *  request, instead of leaving a blocked connection that throws VersionError
 *  and aborts the active write transaction. */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const upgradeTx = (e.target as IDBOpenDBRequest).transaction!;

      // Folders store
      if (!db.objectStoreNames.contains(FOLDERS)) {
        const s = db.createObjectStore(FOLDERS, { keyPath: "id" });
        s.createIndex("position", "position", { unique: false });
        s.createIndex("parent_id", "parent_id", { unique: false });
      } else {
        const store = upgradeTx.objectStore(FOLDERS);
        if (!store.indexNames.contains("parent_id")) {
          store.createIndex("parent_id", "parent_id", { unique: false });
        }
      }

      // Items store
      if (!db.objectStoreNames.contains(ITEMS)) {
        const s = db.createObjectStore(ITEMS, { keyPath: "id" });
        s.createIndex("folder_id", "folder_id", { unique: false });
        s.createIndex("sort_index", "sort_index", { unique: false });
      } else {
        const store = upgradeTx.objectStore(ITEMS);
        if (!store.indexNames.contains("sort_index")) {
          store.createIndex("sort_index", "sort_index", { unique: false });
        }
        // Backfill sort_index on legacy rows.
        const req2 = store.openCursor();
        let i = 0;
        req2.onsuccess = () => {
          const cursor = req2.result;
          if (!cursor) return;
          const v = cursor.value as PersonalItem;
          if (typeof v.sort_index !== "number") {
            v.sort_index = i++;
            cursor.update(v);
          }
          cursor.continue();
        };
      }

      // Files store (web fallback only — holds the raw Blob).
      if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another connection wants to upgrade — release ours so it can.
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
        dbPromise = null;
      };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      // Another tab is holding an older version open. Surface a clear error
      // instead of hanging the queue indefinitely.
      dbPromise = null;
      reject(new Error("IndexedDB upgrade blocked by another tab"));
    };
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction;
        try {
          t = db.transaction(store, mode);
        } catch (err) {
          // Connection was closed (e.g. by onversionchange). Drop the cached
          // promise so the next call re-opens, then bubble the error so the
          // caller can retry.
          dbPromise = null;
          reject(err);
          return;
        }
        const req = run(t.objectStore(store));
        let result: T;
        req.onsuccess = () => { result = req.result as T; };
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || req.error);
        t.onabort = () => reject(t.error || req.error || new Error("IndexedDB transaction aborted"));
      })
  );
}

export const folderDB = {
  put: (rec: PersonalFolder) => tx(FOLDERS, "readwrite", (s) => s.put(rec)),
  get: (id: string) =>
    tx<PersonalFolder | undefined>(FOLDERS, "readonly", (s) => s.get(id)),
  delete: (id: string) => tx(FOLDERS, "readwrite", (s) => s.delete(id)),
  all: () =>
    tx<PersonalFolder[]>(FOLDERS, "readonly", (s) =>
      s.getAll() as IDBRequest<PersonalFolder[]>
    ),
  /** Children of a folder. Pass null for root-level folders. */
  children: async (parent_id: string | null) => {
    const all = await folderDB.all();
    return all.filter((f) => (f.parent_id ?? null) === parent_id);
  },
};

export const itemDB = {
  put: (rec: PersonalItem) => tx(ITEMS, "readwrite", (s) => s.put(rec)),
  get: (id: string) =>
    tx<PersonalItem | undefined>(ITEMS, "readonly", (s) => s.get(id)),
  delete: (id: string) => tx(ITEMS, "readwrite", (s) => s.delete(id)),
  all: () =>
    tx<PersonalItem[]>(ITEMS, "readonly", (s) =>
      s.getAll() as IDBRequest<PersonalItem[]>
    ),
  byFolder: async (folder_id: string) => {
    const all = await itemDB.all();
    return all.filter((i) => i.folder_id === folder_id);
  },
};

/** Web-only: persistent Blob store so uploaded PDFs survive reloads. */
export const fileDB = {
  put: (id: string, blob: Blob) =>
    tx(FILES, "readwrite", (s) => s.put({ id, blob })),
  get: (id: string) =>
    tx<{ id: string; blob: Blob } | undefined>(FILES, "readonly", (s) => s.get(id)),
  delete: (id: string) => tx(FILES, "readwrite", (s) => s.delete(id)),
};
