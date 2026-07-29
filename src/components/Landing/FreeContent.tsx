import { memo } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ClipboardList, ArrowUpRight, Download } from "lucide-react";
import SafarVideoGrid from "./SafarVideoGrid";

const freePdfs = [
  { title: "UP Board English — Grammar Handbook", meta: "PDF · 42 pages", href: "/books" },
  { title: "CBSE Class 10 — Letter Writing Formats", meta: "PDF · 18 pages", href: "/books" },
  { title: "CG Lecturer — Linguistics Notes", meta: "PDF · 64 pages", href: "/books" },
  { title: "Spoken English — 300 Daily Sentences", meta: "PDF · 24 pages", href: "/books" },
  { title: "Unseen Passage Practice Set", meta: "PDF · 30 pages", href: "/books" },
  { title: "Tenses Quick Revision Sheet", meta: "PDF · 8 pages", href: "/books" },
];

const freeTests = [
  { title: "UP Board English — Mock 1", meta: "30 questions · 30 min", href: "/courses" },
  { title: "CBSE Grammar — Diagnostic Test", meta: "25 questions · 20 min", href: "/courses" },
  { title: "CG Lecturer — Literature PYQ Quiz", meta: "40 questions · 45 min", href: "/courses" },
];

const FreeContent = memo(() => (
  <section
    id="videos-section"
    aria-label="Free lectures, PDFs and tests"
    className="py-16 md:py-24 bg-background border-b border-border/60"
  >
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="max-w-2xl mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">
          Free resources
        </p>
        <h2
          className="font-serif text-3xl md:text-4xl text-foreground leading-[1.1]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Sab kuch free — try karein, tab decide karein.
        </h2>
      </div>

      <Tabs defaultValue="lectures" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="lectures">Free Lectures</TabsTrigger>
          <TabsTrigger value="pdfs">Free PDFs</TabsTrigger>
          <TabsTrigger value="tests">Free Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="lectures" className="mt-0">
          <div className="-mx-6 lg:-mx-10">
            <SafarVideoGrid />
          </div>
        </TabsContent>

        <TabsContent value="pdfs" className="mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {freePdfs.map((p) => (
              <Link
                key={p.title}
                to={p.href}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground leading-snug mb-1">{p.title}</h3>
                  <p className="text-xs text-muted-foreground">{p.meta}</p>
                </div>
                <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link to="/books" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all resources <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {freeTests.map((t) => (
              <Link
                key={t.title}
                to={t.href}
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent mb-3">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <h3 className="font-serif text-lg text-foreground leading-snug mb-1" style={{ fontFamily: "var(--font-serif)" }}>
                  {t.title}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">{t.meta}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Start test <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </section>
));

FreeContent.displayName = "FreeContent";
export default FreeContent;
