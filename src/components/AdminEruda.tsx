// Eruda in-app DevTools — auto-loads ONLY for signed-in admin accounts.
// Non-admins (including signed-out users) never download the eruda chunk.
//
// Two-phase boot to give admins a true frog-eye view from t=0:
//   1. On admin detection, persist `nb_admin_eruda=1` in localStorage.
//   2. main.tsx checks that flag BEFORE any other code runs and loads
//      Eruda synchronously — so subsequent reloads capture every log
//      (crashShield init, sentry init, web-vitals, network, etc.).
// First-ever admin session still only captures post-init logs; one reload
// after first detection unlocks the full frog-eye view.
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

declare global {
  interface Window {
    __nb_eruda_loaded?: boolean;
  }
}

const ERUDA_FLAG = "nb_admin_eruda";

export default function AdminEruda() {
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // If user is no longer admin (signed out / role revoked) clear the flag
    // so non-admins on a shared device don't keep getting Eruda on reload.
    if (!isAdmin) {
      try { localStorage.removeItem(ERUDA_FLAG); } catch { /* noop */ }
      return;
    }

    // Persist for early-boot load on next reload.
    try { localStorage.setItem(ERUDA_FLAG, "1"); } catch { /* noop */ }

    if (window.__nb_eruda_loaded) return;
    window.__nb_eruda_loaded = true;

    import("eruda")
      .then(({ default: eruda }) => {
        try {
          eruda.init();
          const btn = document.querySelector(".eruda-entry-btn") as HTMLElement | null;
          if (btn) btn.setAttribute("aria-label", "Admin DevTools");
          // eslint-disable-next-line no-console
          console.log("[admin] Eruda DevTools loaded for admin account.");
          // eslint-disable-next-line no-console
          console.info(
            "[admin] Frog-eye view active. Reload once to capture full boot logs (crashShield/sentry/web-vitals)."
          );
        } catch (e) {
          console.warn("[admin] Eruda init failed", e);
        }
      })
      .catch(() => {
        window.__nb_eruda_loaded = false; // allow retry on next mount
      });
  }, [isAdmin]);

  return null;
}

