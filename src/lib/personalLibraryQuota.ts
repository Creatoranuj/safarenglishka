import { itemDB } from "./personalLibraryDB";

export const PERSONAL_LIB_SOFT_CAP_MB = 500;
export const PERSONAL_LIB_SOFT_CAP_BYTES = PERSONAL_LIB_SOFT_CAP_MB * 1024 * 1024;

export async function getUsedBytes(): Promise<number> {
  const all = await itemDB.all();
  return all.reduce((s, i) => s + (i.size_bytes || 0), 0);
}

export async function canAdd(size: number): Promise<{ ok: boolean; used: number; cap: number }> {
  const used = await getUsedBytes();
  return {
    ok: used + size <= PERSONAL_LIB_SOFT_CAP_BYTES,
    used,
    cap: PERSONAL_LIB_SOFT_CAP_BYTES,
  };
}

export function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
