import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import WhatsAppIcon from "@/components/common/WhatsAppIcon";
import { WHATSAPP_NUMBER } from "@/components/common/WhatsAppButton";

/**
 * Conversion-focused sticky bar for mobile only.
 * - Left: WhatsApp counsellor
 * - Right: Enroll now → scrolls to #exam-tracks
 * Hides once the footer scrolls into view (avoids double-CTA overlap).
 */
const StickyMobileCTA = () => {
  const [visible, setVisible] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Watch footer visibility. Fallback: always visible.
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Namaste! Mujhe Safar English ke batches ke baare mein jaankari chahiye.",
  )}`;

  const scrollToTracks = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("exam-tracks");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden />
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-40 md:hidden",
          "bg-background/95 backdrop-blur border-t border-border",
          "px-3 py-2.5 flex items-center gap-2",
          "transition-transform duration-200",
          visible ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-11 rounded-md border border-whatsapp/40 bg-whatsapp/10 text-whatsapp text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <WhatsAppIcon size={16} /> Counsellor
        </a>
        <a
          href="#exam-tracks"
          onClick={scrollToTracks}
          className="flex-[1.2] h-11 rounded-md bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          Enroll now <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </>
  );
};

export default StickyMobileCTA;
