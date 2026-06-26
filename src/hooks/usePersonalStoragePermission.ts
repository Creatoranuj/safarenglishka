import { useCallback, useEffect, useState } from "react";

const KEY = "nb_personal_lib_allowed";

export function usePersonalStoragePermission() {
  const [allowed, setAllowed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setAllowed(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const allow = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setAllowed(true);
  }, []);

  const revoke = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setAllowed(false);
  }, []);

  return { allowed, allow, revoke };
}
