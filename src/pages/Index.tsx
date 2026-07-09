import { useMemo, memo, useState, useEffect, Suspense } from "react";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Menu } from "lucide-react";

import Hero, { HeroData, HeroStat } from "../components/Landing/Hero";
// Below-the-fold landing sections are lazy-loaded so their deps (radix-select,
// floating-ui, popper, dismissable-layer pulled in by LeadForm) stay out of
// the initial entry chunk. Saves ~18KB gzipped on cold start.
const WhyChooseUs = lazyWithRetry(() => import("../components/Landing/WhyChooseUs"));
const SafarVideoGrid = lazyWithRetry(() => import("../components/Landing/SafarVideoGrid"));
const CommunityStrip = lazyWithRetry(() => import("../components/Landing/CommunityStrip"));
const LeadForm = lazyWithRetry(() => import("../components/Landing/LeadForm"));
const Footer = lazyWithRetry(() => import("../components/Landing/Footer"));
import { Button } from "../components/ui/button";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "../components/ui/sheet";
import logo from "../assets/branding/logo_icon_web.webp";
import { useLandingData } from "../hooks/useLandingData";
import { usePlatformStats } from "../hooks/usePlatformStats";

const defaultHeroData: HeroData = {
  title: "Angreji bolne ka dar? Ab safar shuru karein.",
  subtitle: "Practical spoken English, grammar aur confidence — Hindi speakers ke liye, Raj VIP Sir ke saath. Free video lessons, daily practice aur live doubt-clearing.",
  cta_text: "Free lesson dekhein",
};

const Navigation = memo(({ isAuthenticated }: { isAuthenticated: boolean }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkCls = "text-sm font-medium text-foreground/80 hover:text-foreground transition-colors";

  const desktopNav = (
    <>
      <Link to="/courses" className={linkCls}>Courses</Link>
      <Link to="/books" className={linkCls}>Resources</Link>
      <a href="#why-choose-us" className={linkCls}>About</a>
    </>
  );

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border"
          : "bg-background/80 backdrop-blur-sm border-b border-transparent"
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="container mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="Safar English" className="h-8 w-8 rounded-md" loading="eager" />
          <span
            className="font-serif text-lg text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Safar English
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {desktopNav}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link to="/dashboard" onClick={() => { void selectionHaptic(); }}>
              <Button className="h-10 px-5 rounded-md text-sm font-medium active:scale-[0.97] transition-transform duration-150">Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" onClick={() => { void selectionHaptic(); }} className={linkCls}>Login</Link>
              <Link to="/signup" onClick={() => { void tapHaptic("light"); }}>
                <Button className="h-10 px-5 rounded-md text-sm font-medium active:scale-[0.97] transition-transform duration-150">Sign up free</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <img src={logo} alt="Logo" className="h-8 w-8 rounded-lg" />
                <span className="font-serif" style={{ fontFamily: "var(--font-serif)" }}>Safar English</span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 mt-8">
              <Link to="/courses" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="h-11 w-full justify-start">Courses</Button>
              </Link>
              <Link to="/books" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="h-11 w-full justify-start">Resources</Button>
              </Link>
              <a href="#why-choose-us" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="h-11 w-full justify-start">About</Button>
              </a>
              <div className="h-px bg-border my-4" />
              {isAuthenticated ? (
                <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                  <Button className="h-11 w-full">Dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="h-11 w-full">Login</Button>
                  </Link>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>
                    <Button className="h-11 w-full mt-2">Sign up free</Button>
                  </Link>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
});

Navigation.displayName = "Navigation";

// Trust strip — reframed for English-learning audience
const TrustStrip = memo(() => (
  <section className="py-10 bg-background border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Trusted by learners preparing for
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-medium text-foreground/70">
          <span>Spoken English</span>
          <span className="text-border">·</span>
          <span>Class 9–12 Boards</span>
          <span className="text-border">·</span>
          <span>SSC · Bank</span>
          <span className="text-border">·</span>
          <span>Interviews</span>
          <span className="text-border">·</span>
          <span>Daily Practice</span>
        </div>
      </div>
    </div>
  </section>
));
TrustStrip.displayName = "TrustStrip";

const Index = () => {
  const { isAuthenticated } = useAuth();
  const authState = useMemo(() => isAuthenticated, [isAuthenticated]);
  const { getContentByKey } = useLandingData();
  const { stats: platformStats } = usePlatformStats();

  const heroData = useMemo(() => {
    const dbHero = getContentByKey("hero");
    if (dbHero) return {
      title: dbHero.title || defaultHeroData.title,
      subtitle: dbHero.subtitle || defaultHeroData.subtitle,
      cta_text: dbHero.cta_text || defaultHeroData.cta_text,
    };
    return defaultHeroData;
  }, [getContentByKey]);

  const heroStats: HeroStat[] = useMemo(() => {
    const fmt = (n: number) => {
      if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
      if (n >= 100) return `${Math.floor(n / 100) * 100}+`;
      if (n >= 10) return `${Math.floor(n / 10) * 10}+`;
      return `${Math.max(n, 1)}+`;
    };
    return [
      { stat_key: "students", stat_value: fmt(platformStats.total_students) },
      { stat_key: "courses", stat_value: fmt(platformStats.total_courses) },
      { stat_key: "teachers", stat_value: fmt(platformStats.total_teachers) },
    ];
  }, [platformStats]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation isAuthenticated={authState} />

      <main className="pt-16">
        <Hero data={heroData} stats={heroStats} />
        <TrustStrip />
        <Suspense fallback={<div className="min-h-[200px]" aria-hidden />}>
          <section id="videos-section" aria-label="Free video lessons"><SafarVideoGrid /></section>
          <section id="why-choose-us" aria-label="Our method"><WhyChooseUs /></section>
          <section id="community" aria-label="Join our community"><CommunityStrip /></section>
          <section id="lead-form" aria-label="Final CTA"><LeadForm /></section>
        </Suspense>
      </main>

      <Suspense fallback={null}><Footer /></Suspense>

      {/* Sticky mobile CTA — slimmer, editorial */}
      {!authState && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3 md:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <Link to="/login" onClick={() => { void selectionHaptic(); }} className="flex-1">
            <Button variant="outline" className="w-full h-11 text-sm font-medium rounded-md active:scale-[0.97] transition-transform duration-150">
              Login
            </Button>
          </Link>
          <Link to="/signup" onClick={() => { void tapHaptic("light"); }} className="flex-1">
            <Button className="w-full h-11 text-sm font-medium rounded-md active:scale-[0.97] transition-transform duration-150">
              Sign up free
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default Index;
