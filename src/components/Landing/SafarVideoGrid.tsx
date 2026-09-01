import { memo, useEffect, useState } from "react";
import { ExternalLink, Play, X } from "lucide-react";

// Curated highlights from youtube.com/@safarenglishka.
// Videos play inline in a lightbox — no YouTube redirect, no login required.
type SafarVideo = {
  id: string;
  title: string;
  tag: string;
};

const videos: SafarVideo[] = [
  { id: "shw-F8XV_x8", title: "Farewell Class-12 — VIP Coaching", tag: "Class 12" },
  { id: "v1y9a87sGeA", title: "English Speaking Practice — Daily Use Sentences", tag: "Spoken" },
  { id: "FHKezmRHk-Q", title: "How to introduce yourself in English", tag: "Speaking" },
  { id: "iUa8mMZTvME", title: "Basic English Grammar for Beginners", tag: "Grammar" },
];

const CHANNEL_URL = "https://youtube.com/@safarenglishka";

const SafarVideoGrid = memo(() => {
  const [active, setActive] = useState<SafarVideo | null>(null);

  // Lock scroll + close on Escape while the lightbox is open.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return (
    <section
      id="videos"
      aria-label="Free video lessons from Safar English Ka"
      className="py-20 md:py-28 bg-background border-b border-border/60"
    >
      <div className="container mx-auto max-w-7xl px-6 lg:px-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">
              Free lessons · YouTube
            </p>
            <h2
              className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Roz ek chota safar. Bada change.
            </h2>
            <p className="text-lg text-muted-foreground mt-5 leading-relaxed">
              Raj VIP Sir ke saath practical spoken English — 599+ free videos, Hindi
              explanation, real daily-use sentences.
            </p>
          </div>

          <a
            href={CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors self-start md:self-end"
          >
            Visit channel
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {videos.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActive(v)}
              className="group block text-left"
              aria-label={`Play ${v.title}`}
            >
              <div className="relative overflow-hidden rounded-sm border border-border/60 bg-muted aspect-video">
                <img
                  src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                  alt={v.title}
                  loading="lazy"
                  width={480}
                  height={270}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0 opacity-90" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-background/90 backdrop-blur-sm shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <Play className="h-6 w-6 text-foreground translate-x-[1px]" fill="currentColor" />
                  </span>
                </div>
                <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.14em] font-medium bg-background/95 text-foreground px-2 py-1 rounded-sm">
                  {v.tag}
                </span>
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground leading-snug group-hover:text-accent transition-colors">
                {v.title}
              </h3>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            aria-label="Close video"
            onClick={() => setActive(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="w-full max-w-5xl aspect-video rounded-sm overflow-hidden shadow-2xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${active.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={active.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </section>
  );
});

SafarVideoGrid.displayName = "SafarVideoGrid";
export default SafarVideoGrid;
