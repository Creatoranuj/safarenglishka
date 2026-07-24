import { memo } from "react";
import { Button } from "../ui/button";
import { ArrowRight, Star } from "lucide-react";
import { Link } from "react-router-dom";
import HeroIllustration from "./HeroIllustration";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";

export interface HeroData {
  title: string;
  subtitle: string;
  cta_text: string;
}

export interface HeroStat {
  stat_key: string;
  stat_value: string;
}

interface HeroProps {
  data: HeroData | null;
  stats?: HeroStat[];
}

const chips = ["UP Board", "CBSE", "CG Lecturer", "Spoken English", "Interview"];

// Deterministic avatar cluster — semantic tokens only, no hardcoded colors.
const avatarSeeds = [
  "bg-primary/20 text-primary",
  "bg-accent/25 text-accent",
  "bg-success/20 text-success",
  "bg-secondary/20 text-secondary",
];

const Hero = memo(({ data, stats = [] }: HeroProps) => {
  const studentCount = stats.find(s => s.stat_key === 'students')?.stat_value || '10k+';
  const courseCount = stats.find(s => s.stat_key === 'courses')?.stat_value || '50+';
  const teacherCount = stats.find(s => s.stat_key === 'teachers')?.stat_value || '30+';

  return (
    <section className="relative bg-background">
      <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-14 md:py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <div className="space-y-7">
            {/* Trust eyebrow — avatar cluster + rating */}
            <div className="flex items-center gap-3 animate-fade-in-up">
              <div className="flex -space-x-2">
                {avatarSeeds.map((cls, i) => (
                  <span
                    key={i}
                    className={`h-7 w-7 rounded-full ring-2 ring-background flex items-center justify-center text-[11px] font-bold ${cls}`}
                    aria-hidden
                  >
                    {["R", "S", "A", "P"][i]}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  ))}
                </span>
                <p className="eyebrow !text-foreground/70 !text-[11px] tabular-nums">
                  Trusted by {studentCount} students
                </p>
              </div>
            </div>

            <h1
              className="font-serif text-display-sm md:text-display-md lg:text-display-lg text-foreground animate-fade-in-up [animation-delay:0.08s]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {data?.title || "Angreji bolne ka dar? Ab safar shuru karein."}
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-in-up [animation-delay:0.16s]">
              {data?.subtitle ||
                "Board English, spoken English aur CG Lecturer paper prep — sab Hindi mein samjhaya, Raj VIP Sir ke saath. Free video lessons, daily practice aur live doubt-clearing."}
            </p>

            {/* Audience chips */}
            <div className="flex flex-wrap gap-2 pt-1 animate-fade-in-up [animation-delay:0.24s]">
              {chips.map((c) => (
                <span
                  key={c}
                  className="text-xs font-medium text-foreground/80 border border-border rounded-full px-3 py-1 bg-muted/40"
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 animate-fade-in-up [animation-delay:0.32s]">
              <Link to="/signup" onClick={() => { void tapHaptic("light"); }}>
                <Button size="lg" className="h-12 px-7 rounded-xl text-base font-semibold gap-2 w-full sm:w-auto shadow-md shadow-primary/20 active:scale-[0.97] transition-transform duration-150 ease-out">
                  {data?.cta_text || "Free lesson dekhein"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/courses" onClick={() => { void selectionHaptic(); }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 rounded-xl text-base font-semibold border-foreground/15 w-full sm:w-auto active:scale-[0.97] transition-transform duration-150 ease-out"
                >
                  Courses dekhein
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: illustration */}
          <div className="order-first lg:order-none animate-fade-in-up [animation-delay:0.1s]">
            <HeroIllustration />
          </div>
        </div>

        {/* Stats strip — tabular-nums, editorial */}
        <div className="mt-14 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 pt-8 border-t border-border/60">
          {[
            { v: studentCount, l: "Students" },
            { v: courseCount, l: "Courses" },
            { v: teacherCount, l: "Mentors" },
            { v: "4.9", l: "Rating" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-serif text-3xl md:text-4xl text-foreground tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>
                {s.v}
              </div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1 font-medium">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

Hero.displayName = "Hero";
export default Hero;
