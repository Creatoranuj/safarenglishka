// Safar English Ka — Native chrome (status bar, keyboard, haptics) for Capacitor.
// All Capacitor plugin APIs are dynamically imported and only run on native
// platforms, so the web bundle stays lean and SSR-safe.

const getCapacitor = async () => {
  try {
    return (await import("@capacitor/core")).Capacitor;
  } catch {
    return null;
  }
};

function hslVarToHex(varName: string): string {
  if (typeof window === "undefined") return "#000000";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return "#000000";
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return "#000000";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const to255 = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

let statusBarMod: typeof import("@capacitor/status-bar") | null = null;

export async function applyStatusBarForTheme(theme: "light" | "dark") {
  const Capacitor = await getCapacitor();
  if (!Capacitor?.isNativePlatform?.()) return;
  try {
    if (!statusBarMod) statusBarMod = await import("@capacitor/status-bar");
    const { StatusBar, Style } = statusBarMod;
    // Overlay = false so the system reserves its own strip for the status bar
    // and the WebView starts cleanly below it. This prevents the status bar
    // from painting on top of full-bleed content like inline video players.
    // Fullscreen video still uses Android immersive mode (MainActivity) to
    // hide the status bar entirely during landscape playback.
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    await StatusBar.setStyle({
      style: theme === "dark" ? Style.Dark : Style.Light,
    }).catch(() => {});
    if (Capacitor.getPlatform() === "android") {
      // Match the app's themed surface so the status-bar strip blends with
      // the chrome instead of showing a black bar.
      const bg = hslVarToHex("--background");
      await StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
    }
  } catch {
    // plugin not installed in native shell yet — silently skip
  }
}

async function initKeyboard() {
  const Capacitor = await getCapacitor();
  if (!Capacitor?.isNativePlatform?.()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    if (Capacitor.getPlatform() === "ios") {
      await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    }
    const setKbVar = (px: number) =>
      document.documentElement.style.setProperty("--nb-keyboard-h", `${Math.round(px)}px`);
    Keyboard.addListener("keyboardWillShow", (info) => {
      document.body.classList.add("kb-open");
      setKbVar(info?.keyboardHeight ?? 0);
    });
    Keyboard.addListener("keyboardDidShow", (info) => setKbVar(info?.keyboardHeight ?? 0));
    Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("kb-open");
      setKbVar(0);
    });
    Keyboard.addListener("keyboardDidHide", () => setKbVar(0));
  } catch {
    // ignore
  }
}

let initialized = false;
export async function initNativeChrome(theme: "light" | "dark" = "light") {
  const Capacitor = await getCapacitor();
  if (!Capacitor?.isNativePlatform?.() || initialized) return;
  initialized = true;
  // Tag the root so CSS can apply native-specific tweaks.
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("is-native");
    const platform = Capacitor.getPlatform?.();
    if (platform) document.documentElement.classList.add(`platform-${platform}`);
  }
  await Promise.all([applyStatusBarForTheme(theme), initKeyboard()]);
}

// ── Haptics wrappers ───────────────────────────────────────────────
let hapticsMod: typeof import("@capacitor/haptics") | null = null;
async function getHaptics() {
  const Capacitor = await getCapacitor();
  if (!Capacitor?.isNativePlatform?.()) return null;
  try {
    if (!hapticsMod) hapticsMod = await import("@capacitor/haptics");
    return hapticsMod;
  } catch {
    return null;
  }
}

export async function tapLight() {
  const m = await getHaptics();
  if (!m) return;
  await m.Haptics.impact({ style: m.ImpactStyle.Light }).catch(() => {});
}
export async function tapMedium() {
  const m = await getHaptics();
  if (!m) return;
  await m.Haptics.impact({ style: m.ImpactStyle.Medium }).catch(() => {});
}
export async function notifySuccess() {
  const m = await getHaptics();
  if (!m) return;
  await m.Haptics.notification({ type: m.NotificationType.Success }).catch(() => {});
}
export async function notifyError() {
  const m = await getHaptics();
  if (!m) return;
  await m.Haptics.notification({ type: m.NotificationType.Error }).catch(() => {});
}