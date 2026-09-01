/**
 * LanguageContext.tsx
 * ===================
 * Lightweight UI localisation (no i18n library — keeps the entry chunk flat).
 *
 * English is the default and ships in the entry chunk; hi/bho dictionaries are
 * lazy-imported only when a student actually picks them. Missing keys fall back
 * to English so a partial translation can never render a blank label.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { safeGet, safeSet } from "@/lib/storage";
import en, { type Dict, type TranslationKey } from "@/i18n/en";

export type Lang = "en" | "hi" | "bho";

export const LANGUAGES: { code: Lang; nativeLabel: string; englishLabel: string }[] = [
  { code: "en", nativeLabel: "English", englishLabel: "English" },
  { code: "hi", nativeLabel: "हिंदी", englishLabel: "Hindi" },
  { code: "bho", nativeLabel: "भोजपुरी", englishLabel: "Bhojpuri" },
];

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANG_STORAGE_KEY = "nb-lang";

const isLang = (v: unknown): v is Lang => v === "en" || v === "hi" || v === "bho";

const loaders: Record<Exclude<Lang, "en">, () => Promise<{ default: Partial<Dict> }>> = {
  hi: () => import("@/i18n/hi"),
  bho: () => import("@/i18n/bho"),
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = safeGet(LANG_STORAGE_KEY);
    return isLang(stored) ? stored : "en";
  });
  const [dict, setDict] = useState<Partial<Dict>>({});

  useEffect(() => {
    let cancelled = false;
    if (lang === "en") {
      setDict({});
    } else {
      loaders[lang]()
        .then((m) => {
          if (!cancelled) setDict(m.default);
        })
        .catch(() => {
          if (!cancelled) setDict({});
        });
    }
    safeSet(LANG_STORAGE_KEY, lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "bho" ? "bho" : lang;
    }
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (key: TranslationKey) => dict[key] ?? en[key] ?? key,
    [dict],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Defensive: outside the provider (tests, isolated stories) fall back to English.
    return { lang: "en", setLang: () => {}, t: (key) => en[key] ?? key };
  }
  return ctx;
};

/** Convenience hook mirroring common i18n APIs. */
export const useT = () => useLanguage().t;
