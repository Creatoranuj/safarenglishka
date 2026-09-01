/**
 * LanguagePicker.tsx
 * ==================
 * Sidebar row + bottom sheet that lets students pick the UI language.
 * English is the default; Hindi and Bhojpuri load on demand.
 */
import { useState } from "react";
import { Globe, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { selectionHaptic } from "@/lib/native/haptics";
import { useLanguage, LANGUAGES, type Lang } from "../../contexts/LanguageContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";

interface LanguagePickerProps {
  /** "sidebar" tints for the sidebar surface; "card" for Settings. */
  variant?: "sidebar" | "card";
  className?: string;
  /** Called after a language is picked — the sidebar uses it to close itself. */
  onPicked?: () => void;
}

const LanguagePicker = ({ variant = "sidebar", className, onPicked }: LanguagePickerProps) => {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);

  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  const pick = (code: Lang) => {
    void selectionHaptic();
    setLang(code);
    setOpen(false);
    toast.success(t("lang.changed"));
    onPicked?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void selectionHaptic();
          setOpen(true);
        }}
        aria-label={`${t("lang.label")}: ${active.nativeLabel}`}
        className={cn(
          "flex w-full min-h-[44px] items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150 active:scale-[0.99]",
          variant === "sidebar"
            ? "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:bg-sidebar-accent/70"
            : "border border-border hover:bg-accent/50",
          className,
        )}
      >
        <Globe className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 font-medium">{t("lang.label")}</span>
        <span
          className={cn(
            "text-sm",
            variant === "sidebar" ? "text-sidebar-foreground/60" : "text-muted-foreground",
          )}
        >
          {active.nativeLabel}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          // Sidebar sits at z-[90]; without this the sheet renders behind it.
          className="z-[120] rounded-t-2xl pb-safe-b"
          overlayClassName="z-[110]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{t("lang.title")}</SheetTitle>
            <SheetDescription>{t("lang.description")}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-1" role="radiogroup" aria-label={t("lang.label")}>
            {LANGUAGES.map((option) => {
              const isActive = option.code === lang;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => pick(option.code)}
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150 active:scale-[0.99]",
                    isActive ? "bg-primary/10 text-primary" : "hover:bg-accent/60",
                  )}
                >
                  <span className="flex-1">
                    <span className="block text-base font-medium">{option.nativeLabel}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        isActive ? "text-primary/70" : "text-muted-foreground",
                      )}
                    >
                      {option.englishLabel}
                      {option.code === "en" ? ` · ${t("lang.default")}` : ""}
                    </span>
                  </span>
                  {isActive && <Check className="h-5 w-5 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default LanguagePicker;
