import { useEffect, useState } from "react";

/**
 * Reactive online/offline status. Uses @capacitor/network on native and
 * navigator.onLine on web. Single subscription per hook instance.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          const { Network } = await import("@capacitor/network");
          const s = await Network.getStatus();
          if (!cancelled) setOnline(s.connected);
          const h = await Network.addListener("networkStatusChange", (st) =>
            setOnline(st.connected)
          );
          cleanup = () => h.remove();
          return;
        }
      } catch {
        /* web fallback */
      }
      const upd = () => setOnline(navigator.onLine);
      upd();
      window.addEventListener("online", upd);
      window.addEventListener("offline", upd);
      cleanup = () => {
        window.removeEventListener("online", upd);
        window.removeEventListener("offline", upd);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return online;
}