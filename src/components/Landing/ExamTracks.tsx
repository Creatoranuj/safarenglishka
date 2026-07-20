import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Clock, Languages, Users } from "lucide-react";
import { useLandingCourses } from "@/hooks/useLandingCourses";
import CountdownPill from "./CountdownPill";

// Gradient ribbon per track — infers from badge/title keywords so the
// admin doesn't have to pick a color. Semantic-only, no raw hex.
const ribbonFor = (label: string): string => {
  const s = label.toLowerCase();
  if (s.includes("up")) return "from-indigo-500 to-blue-500";
  if (s.includes("cbse")) return "from-emerald-500 to-teal-500";
  if (s.includes("cg") || s.includes("lecturer")) return "from-amber-500 to-orange-500";
  if (s.includes("spoken") || s.includes("english")) return "from-rose-500 to-pink-500";
  return "from-primary to-accent";
};

const ExamTracks = memo(() => {
  const { data: tracks = [], isLoading } = useLandingCourses();

  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-7xl px-6 lg:px-10">
        <div className="max-w-2xl mb-10 md:mb-14">
          <p className="eyebrow mb-4">Live batches</p>
          <h2
            className="font-serif text-display-sm md:text-display-md text-foreground leading-[1.05]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Apne exam ke liye ek dedicated batch chunein.
          </h2>
          <p className="text-muted-foreground mt-4 text-base md:text-lg leading-relaxed">
            Raj VIP Sir ke saath — Hindi medium friendly, chapter-wise videos, weekly tests aur doubt support.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-72 rounded-2xl bg-muted/60 animate-pulse" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Abhi koi batch active nahi hai. Admin panel se add karein.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {tracks.map((t) => {
              const exploreHref = t.course_id
                ? `/courses/${t.course_id}`
                : t.route ?? `/courses?track=${t.slug}`;
              const demoHref = t.route ? `${t.route}#free-demo` : `/courses?track=${t.slug}&demo=1`;
              const ribbon = ribbonFor(`${t.badge} ${t.title}`);
              return (
                <article
                  key={t.id}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 pt-6 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-primary/40"
                >
                  {/* Top gradient ribbon — per-exam color */}
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ribbon}`}
                    aria-hidden
                  />

                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 rounded-full text-primary-foreground text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 bg-gradient-to-r ${ribbon}`}>
                      {t.badge}
                    </span>
                    {t.seats && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                        <Users className="h-3 w-3" />
                        {t.seats}
                      </span>
                    )}
                  </div>

                  <h3
                    className="font-serif text-lg text-foreground leading-snug mb-1"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {t.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">by {t.faculty}</p>
                  {t.start_date && (
                    <div className="mb-2"><CountdownPill startDate={t.start_date} /></div>
                  )}
                  <p className="text-sm text-foreground/80 leading-relaxed mb-4 line-clamp-2">{t.short}</p>

                  <ul className="space-y-1.5 mb-4 text-xs text-muted-foreground">
                    {t.start_date && <li className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> {t.start_date}</li>}
                    {t.duration && <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {t.duration}</li>}
                    {t.language && <li className="flex items-center gap-2"><Languages className="h-3.5 w-3.5" /> {t.language}</li>}
                  </ul>

                  {t.price_effective && (
                    <div className="flex items-baseline gap-2 mb-4 tabular-nums">
                      <span className="text-lg font-bold text-foreground">₹{t.price_effective}</span>
                      {t.price_mrp && t.price_mrp > t.price_effective && (
                        <>
                          <span className="text-xs text-muted-foreground line-through">₹{t.price_mrp}</span>
                          <span className="text-[11px] font-semibold text-accent">
                            {Math.round((1 - t.price_effective / t.price_mrp) * 100)}% off
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2">
                    <Link
                      to={exploreHref}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-primary text-primary-foreground text-sm font-semibold h-10 px-3 hover:bg-primary/90 transition-colors active:scale-[0.98]"
                    >
                      {t.course_id ? "Buy now" : "Explore"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      to={demoHref}
                      className="inline-flex items-center justify-center rounded-xl border border-border text-foreground text-xs font-semibold h-10 px-3 hover:bg-muted transition-colors"
                    >
                      Free demo
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});

ExamTracks.displayName = "ExamTracks";
export default ExamTracks;

