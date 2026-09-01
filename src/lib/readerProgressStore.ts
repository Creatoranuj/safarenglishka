/**
 * Monotonic progress floor for the reader overlay.
 *
 * Why a module-level store instead of component state: the reader remounts on
 * internal retries (range-stream stall → whole-file byte fallback, transport
 * retry, archive re-resolve). Component state resets to 0% on every remount,
 * so the visible bar walked *backwards* — the "badta hai, phir kam hota hai"
 * bug. The floor survives remounts for the same document and is cleared when a
 * different document opens or the entry goes stale.
 */

const STALE_MS = 120_000;

let currentKey = "";
let floor = 0;
let touchedAt = 0;

/** Highest percent already shown for `key` (0 when unknown/stale). */
export function getProgressFloor(key: string): number {
  if (!key || key !== currentKey) return 0;
  if (Date.now() - touchedAt > STALE_MS) return 0;
  return floor;
}

/** Raise the floor for `key`. Never lowers; capped at 99 (100 = ready). */
export function raiseProgressFloor(key: string, percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return getProgressFloor(key);
  if (key !== currentKey) {
    currentKey = key;
    floor = 0;
  }
  floor = Math.max(floor, Math.min(99, Math.round(percent)));
  touchedAt = Date.now();
  return floor;
}

/** Clear the floor (call when a document finishes or a new one opens). */
export function resetProgressFloor(key = ""): void {
  currentKey = key;
  floor = 0;
  touchedAt = Date.now();
}
