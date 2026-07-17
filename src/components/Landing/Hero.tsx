import { memo } from "react";
import { Button } from "../ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import heroAvifPtr from "../../assets/landing/hero_banner_coaching_center.avif.asset.json";
import heroWebpPtr from "../../assets/landing/hero_banner_coaching_center.webp.asset.json";
const heroAvif = heroAvifPtr.url;
const heroWebp = heroWebpPtr.url;
import { Picture } from "../ui/Picture";

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

const Hero = memo(({ data, stats = [] }: HeroProps) => {
  const studentCount = stats.find(s => s.stat_key === 'students')?.stat_value || '5k+';
  const courseCount = stats.find(s => s.stat_key === 'courses')?.stat_value || '50+';
  const teacherCount = stats.find(s => s.stat_key === 'teachers')?.stat_value || '30+';

  return (
    <section className="relative bg-background border-b border-border/60">
      <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-16 md:py-24 lg:py-28">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* Editorial copy — 7 cols */}
          <div className="lg:col-span-7 space-y-7">
            <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium">
              Safar English Ka · Raj VIP Sir
            </p>

            <h1
              className="font-serif text-[40px] leading-[1.05] md:text-6xl lg:text-7xl text-foreground tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {data?.title || "Angreji bolne ka dar? Ab safar shuru karein."}
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              {data?.subtitle ||
                "Practical spoken English, grammar aur confidence — Hindi speakers ke liye, Raj VIP Sir ke saath. Free video lessons, daily practice aur live doubt-clearing."}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link to="/signup">
                <Button size="lg" className="h-12 px-7 rounded-md text-base font-medium gap-2">
                  {data?.cta_text || "Free lesson dekhein"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#videos-section">
                <Button size="lg" variant="outline" className="h-12 px-7 rounded-md text-base font-medium border-foreground/20 active:scale-[.98] transition-transform duration-150">
                  Watch on YouTube
                </Button>
              </a>
            </div>

            {/* Inline editorial stats */}
            <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 pt-8 border-t border-border/60">
              <div>
                <div className="font-serif text-3xl text-foreground">{studentCount}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Students</div>
              </div>
              <div>
                <div className="font-serif text-3xl text-foreground">{courseCount}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Courses</div>
              </div>
              <div>
                <div className="font-serif text-3xl text-foreground">{teacherCount}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Mentors</div>
              </div>
              <div>
                <div className="font-serif text-3xl text-foreground">4.9</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Rating</div>
              </div>
            </div>
          </div>

          {/* Editorial image — 5 cols, no shadow, sharp corners */}
          <div className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-sm border border-border/60 bg-muted">
              <Picture
                srcAvif={heroAvif}
                srcWebp={heroWebp}
                srcFallback={heroWebp}
                alt="Safar English Ka — spoken English classes with Raj VIP Sir"
                className="w-full h-auto object-cover aspect-[4/5] max-md:aspect-[4/3]"
                width={1600}
                height={2000}
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

Hero.displayName = "Hero";
export default Hero;
