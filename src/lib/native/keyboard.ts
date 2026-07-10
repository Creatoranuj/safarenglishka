/**
 * Capacitor Keyboard inset publisher.
 *
 * Sets `--nb-keyboard-h` on <html> while the soft keyboard is on-screen so the
 * app can lift fixed footers / inputs above it via:
 *   padding-bottom: max(env(safe-area-inset-bottom), var(--nb-keyboard-h, 0px))
 *
 * No-op on web (and on platforms where the plugin isn't installed) so it's
 * safe to call unconditionally from main.tsx.
 */
export async function installKeyboardInsetTracker(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    // Lazy-load the plugin so web bundles don't pay for it.
    const mod = await import("@capacitor/keyboard").catch(() => null);
    const Keyboard = mod?.Keyboard;
    if (!Keyboard) return;

    const setVar = (px: number) =>
      document.documentElement.style.setProperty("--nb-keyboard-h", `${Math.round(px)}px`);

    Keyboard.addListener("keyboardWillShow", (info) => {
      setVar(info.keyboardHeight ?? 0);
      // Best-effort scroll the focused input into view so users always see what
      // they're typing. Skip if the focused element already scrolled itself.
      scrollActiveInputIntoView();
    });
    Keyboard.addListener("keyboardDidShow",  (info) => setVar(info.keyboardHeight ?? 0));
    Keyboard.addListener("keyboardWillHide", () => setVar(0));
    Keyboard.addListener("keyboardDidHide",  () => setVar(0));

    // Runtime setResizeMode is intentionally not called: in Capacitor 7 it is
    // iOS-only and Android logs UNIMPLEMENTED. Native resize is configured in
    // capacitor.config.ts via plugins.Keyboard.resize.
  } catch {
    // Plugin not installed or failed to load — silently no-op.
  }
}

/**
 * Scrolls the focused input/textarea into view above the keyboard.
 * Defers one frame so the keyboard-height CSS var is applied first.
 */
function scrollActiveInputIntoView(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && el.getAttribute("contenteditable") !== "true") return;
  requestAnimationFrame(() => {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // older WebViews — best-effort, ignore.
    }
  });
}

