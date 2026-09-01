/**
 * Content-aware fit for sparse PDF pages.
 *
 * Google Sheets / Docs "export to PDF" produces full A4 sheets where the real
 * table occupies a small block in the top-left corner. Fitting the *paper* to
 * a phone screen shrinks that table to an unreadable sliver surrounded by
 * white. These helpers measure the ink bounding box and fit that instead.
 *
 * `fitToContent` is pure and unit-tested; `measureContentBox` touches pdf.js.
 */

export interface ContentBox {
  /** Left edge in viewport(scale=1) pixels, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface ContentFit {
  /** Width to pass to react-pdf <Page width> (full page width, scaled). */
  renderWidth: number;
  /** Visible crop rectangle in CSS px. */
  cropWidth: number;
  cropHeight: number;
  /** Translate applied to the rendered page inside the crop window. */
  offsetX: number;
  offsetY: number;
  /** Page has no ink at all — collapse it. */
  blank: boolean;
}

/** Content must cover less than this fraction of the page to be cropped. */
const COVERAGE_THRESHOLD = 0.75;
/** Never magnify beyond this, so a stray glyph can't explode the page. */
const MAX_ZOOM = 3;
/** Breathing room around the content box, as a fraction of page width. */
const PAD_RATIO = 0.02;

/**
 * Decide how to render a page given its ink bounding box.
 * Returns `null` when the page should render exactly as before.
 */
export function fitToContent(
  box: ContentBox | null,
  page: PageSize,
  containerWidth: number
): ContentFit | null {
  if (!box || !page.width || !page.height || containerWidth <= 0) return null;

  if (box.width <= 2 || box.height <= 2) {
    return { renderWidth: containerWidth, cropWidth: containerWidth, cropHeight: 0, offsetX: 0, offsetY: 0, blank: true };
  }

  const coverW = box.width / page.width;
  const coverH = box.height / page.height;
  if (coverW >= COVERAGE_THRESHOLD && coverH >= COVERAGE_THRESHOLD) return null;

  const pad = page.width * PAD_RATIO;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(page.width - x, box.width + pad * 2);
  const h = Math.min(page.height - y, box.height + pad * 2);
  if (w <= 0 || h <= 0) return null;

  const scale = Math.min(MAX_ZOOM, Math.max(1, containerWidth / w));
  const renderWidth = Math.round(page.width * scale);
  const cropWidth = Math.min(containerWidth, Math.round(w * scale));
  const cropHeight = Math.round(h * scale);

  return {
    renderWidth,
    cropWidth,
    cropHeight,
    offsetX: Math.round(x * scale),
    offsetY: Math.round(y * scale),
    blank: false,
  };
}

type AnyPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent?: () => Promise<{ items: unknown[] }>;
  getOperatorList?: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
};

/**
 * Union bounding box of text runs on a page, in viewport(scale=1) pixels with
 * a top-left origin. Returns null when measurement isn't possible.
 */
export async function measureContentBox(page: AnyPage): Promise<ContentBox | null> {
  try {
    const vp = page.getViewport({ scale: 1 });
    if (!page.getTextContent) return null;
    const text = await page.getTextContent();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const raw of text.items) {
      const item = raw as { transform?: number[]; width?: number; height?: number; str?: string };
      if (!item.transform || (item.str !== undefined && item.str.trim() === "")) continue;
      const [, , , , tx, ty] = item.transform;
      const w = item.width ?? 0;
      const h = item.height ?? 0;
      // PDF space has a bottom-left origin; flip to top-left viewport space.
      const left = tx;
      const right = tx + w;
      const top = vp.height - (ty + h);
      const bottom = vp.height - ty;
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    }

    // No text at all (scanned / image-only page). We cannot tell where the ink
    // is, so report "unknown" and let the page render normally. Returning a
    // zero box here would collapse every scanned page to a blank divider.
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const x = Math.max(0, minX);
    const y = Math.max(0, minY);
    return {
      x,
      y,
      width: Math.min(vp.width - x, maxX - minX),
      height: Math.min(vp.height - y, maxY - minY),
    };
  } catch {
    return null;
  }
}
