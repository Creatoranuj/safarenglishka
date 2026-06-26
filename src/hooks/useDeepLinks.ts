import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ALLOWED_HOSTS = [
  "safarenglishka.vercel.app",
  ...(import.meta.env.DEV ? [
    "41fb2473-4ab4-4ed3-be5d-d2b100dbbe6d.lovableproject.com",
    "id-preview--41fb2473-4ab4-4ed3-be5d-d2b100dbbe6d.lovable.app",
    "id-preview--4c091045-e3ab-4b21-b0e0-3949ece360cb.lovable.app",
  ] : []),
];

const toInternalPath = (rawUrl: string): string | null => {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "com.safarenglish.app:") {
      const path = (u.host ? `/${u.host}` : "") + u.pathname;
      return (path || "/") + u.search;
    }
    if ((u.protocol === "https:" || u.protocol === "http:") && ALLOWED_HOSTS.includes(u.hostname)) {
      return u.pathname + u.search;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Wires Capacitor App URL events to React Router. Capacitor plugins are
 * dynamically imported so the web bundle never ships them.
 */
export const useDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        if (disposed) return;

        App.getLaunchUrl()
          .then((res: { url?: string } | null) => {
            if (!res?.url) return;
            const path = toInternalPath(res.url);
            if (path) navigate(path, { replace: true });
          })
          .catch(() => {});

        const handle = App.addListener("appUrlOpen", (event: { url: string }) => {
          const path = toInternalPath(event.url);
          if (path) navigate(path);
        });

        cleanup = () => {
          Promise.resolve(handle).then((h: { remove: () => void }) => h.remove()).catch(() => {});
        };
      } catch {
        // Not running on Capacitor / plugin not available
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [navigate]);
};