/**
 * Native-first orientation lock helper.
 *
 * On Capacitor (Android/iOS) it asks the OS to physically rotate the device —
 * no CSS transforms on the video iframe (which was causing freezes/lag on
 * Android WebView when toggling landscape in the player).
 *
 * On the web it falls back to the standard Screen Orientation API, then to
 * a no-op (the player still has its CSS-rotation pseudo-fullscreen as a
 * last-resort fallback).
 */

type Mode = "landscape" | "portrait";

const isNativePlatform = (): boolean => {
  try {
    return (globalThis as typeof globalThis & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

// IMPORTANT: Capacitor plugin proxies expose a `then` method. If we resolve
// a Promise with the bare proxy, the runtime treats it as a thenable and
// invokes `ScreenOrientation.then(...)` natively — which throws
// "not implemented on android" because no such bridge method exists.
// Wrap the proxy in a plain object so the Promise chain hands it back
// untouched.
type OrientationPlugin = { lock: (opts: { orientation: Mode }) => Promise<void>; unlock: () => Promise<void> };
let nativePluginPromise: Promise<{ plugin: OrientationPlugin } | null> | null = null;
function loadWrapped(): Promise<{ plugin: OrientationPlugin } | null> {
  if (!isNativePlatform()) return Promise.resolve(null);
  if (!nativePluginPromise) {
    nativePluginPromise = import("@capacitor/screen-orientation")
      .then((m) => ({ plugin: m.ScreenOrientation }))
      .catch(() => null);
  }
  return nativePluginPromise;
}

// CRITICAL: Never resolve a Promise with the bare Capacitor plugin proxy.
// The proxy has a `.then` trap; Promise resolution will invoke it natively
// → "ScreenOrientation.then() is not implemented on android". Always keep
// it inside the `{ plugin }` wrapper and call methods through that.

export async function lockOrientation(mode: Mode): Promise<boolean> {
  try {
    const wrapped = await loadWrapped();
    const native = wrapped?.plugin;
    if (native && typeof native.lock === "function") {
      await native.lock({ orientation: mode });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const so = (screen as unknown as { orientation?: { lock?: (mode: Mode) => Promise<void> } }).orientation;
    if (so?.lock) {
      await so.lock(mode);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function unlockOrientation(): Promise<void> {
  try {
    const wrapped = await loadWrapped();
    const native = wrapped?.plugin;
    if (native && typeof native.unlock === "function") {
      await native.unlock();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    const so = (screen as unknown as { orientation?: { unlock?: () => void } }).orientation;
    if (so?.unlock) so.unlock();
  } catch {
    /* ignore */
  }
}

export const isNativeOrientationAvailable = () => isNativePlatform();

/**
 * Pure decision helper for the reader's landscape fallback.
 *
 * The reader rotates its own surface in CSS only when the OS refused the
 * orientation lock AND the viewport is still portrait. If the device really
 * did rotate (viewport already landscape), a CSS rotation on top of it sizes
 * the surface to the short screen edge — the page then renders as a narrow
 * centre column with white space on both sides.
 */
export function shouldCssRotate(
  lockSucceeded: boolean,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (lockSucceeded) return false;
  return viewportHeight >= viewportWidth;
}

export const isViewportLandscape = (): boolean => {
  if (typeof window === "undefined") return false;
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  return w > h;
};
