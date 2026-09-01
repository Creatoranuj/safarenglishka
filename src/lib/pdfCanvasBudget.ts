/**
 * Canvas memory budget helpers for the PDF reader (crash-shield).
 *
 * react-pdf rasterises each page at `width * devicePixelRatio`, so bitmap
 * bytes grow with the SQUARE of both width and DPR. These helpers are pure so
 * the clamp can be asserted at runtime by tests instead of by source matching.
 */

/** Hard ceiling on effective DPR regardless of zoom or device RAM. */
export const MAX_EFFECTIVE_DPR = 3;

/** Fallback ceiling for phones that report no `deviceMemory` (older Android). */
export const DEFAULT_DEVICE_MEMORY_GB = 4;

/**
 * Megabytes of canvas bitmap we allow for the pages that are on screen. The
 * WebView typically dies well before the device RAM does, so this stays a small
 * fraction of total memory: ~24MB on a 2GB phone, ~96MB on an 8GB phone.
 */
export function visiblePageBudgetMb(deviceMemoryGb?: number): number {
  const gb = Number.isFinite(deviceMemoryGb) && (deviceMemoryGb as number) > 0
    ? (deviceMemoryGb as number)
    : DEFAULT_DEVICE_MEMORY_GB;
  return Math.max(24, Math.min(96, gb * 12));
}

/**
 * Pick the sharpest device-pixel-ratio the memory budget can afford.
 *
 * The previous rule was a blunt `MAX_DPR / zoom`, which collapsed the canvas to
 * 1x exactly when the user zoomed in to read fine handwriting — the page went
 * soft at the moment it mattered most. Instead, keep the full device DPR while
 * the estimated bitmap for the visible pages fits the budget, and only step
 * down (in 0.25 increments) when it does not. High-RAM phones therefore render
 * genuinely HD at 2x zoom; 2GB phones fall back to roughly today's behaviour.
 */
export function clampCanvasDpr(
  zoom: number,
  dpr: number,
  opts: {
    cssWidth?: number;
    pageRatio?: number;
    visiblePages?: number;
    deviceMemoryGb?: number;
  } = {}
): number {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const safeDpr = Math.max(1, Number.isFinite(dpr) && dpr > 0 ? dpr : 1);
  const ceiling = Math.min(safeDpr, MAX_EFFECTIVE_DPR);

  const cssWidth = opts.cssWidth && opts.cssWidth > 0 ? opts.cssWidth : 390;
  const pageRatio = opts.pageRatio && opts.pageRatio > 0 ? opts.pageRatio : 1.414;
  const pages = Math.max(1, opts.visiblePages ?? 2);
  const budget = visiblePageBudgetMb(opts.deviceMemoryGb);

  for (let candidate = ceiling; candidate > 1; candidate -= 0.25) {
    const mb = canvasMegabytes(cssWidth * safeZoom, pageRatio, candidate) * pages;
    if (mb <= budget) return Math.round(candidate * 100) / 100;
  }
  return 1;
}

/** Approximate RGBA bitmap size of one rendered page, in megabytes. */
export function canvasMegabytes(cssWidth: number, pageRatio: number, dpr: number): number {
  const w = cssWidth * dpr;
  const h = cssWidth * pageRatio * dpr;
  return (w * h * 4) / (1024 * 1024);
}

/**
 * Off-screen pages should drop their canvas once memory pressure is likely.
 *
 * Previously this was `true` for EVERY Archive.org document, so paging back
 * and forth re-rendered each page from scratch — the "Archive pages load
 * slowly" complaint. Archive scans are heavy, but a phone with ≥4GB RAM can
 * comfortably hold the neighbouring pages, so only release when zoomed in or
 * when the device is genuinely low on memory.
 *
 * Long documents are the third case: with release off, EVERY page the reader
 * scrolls past keeps its bitmap alive (measured: 40/40 canvases live after one
 * pass through a 40-page PDF). That grows without bound on a 300-page batch
 * note and is the classic low-RAM Android OOM. Past `LONG_DOCUMENT_PAGES` we
 * always release distant pages; the 1200px IntersectionObserver margin keeps
 * the neighbours mounted, so scrolling stays flicker-free.
 */
export const LONG_DOCUMENT_PAGES = 20;

export function shouldReleaseDistantPages(
  isArchive: boolean,
  zoom: number,
  deviceMemoryGb?: number,
  pageCount?: number,
): boolean {
  if (zoom > 1.5) return true;
  const gb = Number.isFinite(deviceMemoryGb) && (deviceMemoryGb as number) > 0
    ? (deviceMemoryGb as number)
    : DEFAULT_DEVICE_MEMORY_GB;
  if (Number.isFinite(pageCount) && (pageCount as number) > LONG_DOCUMENT_PAGES) return true;
  return isArchive && gb < 4;
}


