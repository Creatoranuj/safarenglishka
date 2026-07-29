/**
 * Compute the pixel width to render a PDF page at so it fits the mobile
 * viewport without horizontal clipping.
 *
 *  - Clamps to the visual viewport width (handles pinch-zoom on mobile).
 *  - Subtracts horizontal padding (`px-2` => 16px) so the canvas never overflows.
 *  - Caps at 1100px on desktop.
 *  - Floors at 240px so very narrow popups still render.
 *
 * Pure / side-effect free — covered by `src/test/pdf-system.test.ts` Suite 7.
 */
export function computeFitPageWidth(
  viewportWidth: number,
  containerWidth?: number
): number {
  const vp = Math.max(0, Math.floor(viewportWidth || 0));
  const cw = containerWidth && containerWidth > 0 ? Math.floor(containerWidth) : vp;
  const bounded = Math.min(cw, vp);
  return Math.max(240, Math.min(bounded - 16, 1100));
}
