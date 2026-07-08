import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const resources = [
  { tag: "Notes", title: "NEET Biology — Complete Revision Notes", desc: "Chapter-wise summaries, diagrams, and high-yield facts." },
  { tag: "Practice", title: "Physics Numerical Workbook", desc: "1,200+ solved problems graded by difficulty." },
  { tag: "Mock Tests", title: "Full-Length NEET Mock Series", desc: "20 timed tests with detailed analytics and rank prediction." },
];

const StudyMaterials = memo(() => (
  <section className="py-20 md:py-28 bg-muted/40 border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">Free Resources</p>
          <h2
            className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Notes, workbooks, and mocks — on the house.
          </h2>
        </div>
        <Link
          to="/books"
          className="text-sm font-medium text-foreground hover:text-accent transition-colors inline-flex items-center gap-1 self-start md:self-auto"
        >
          Browse all resources <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-border">
        {resources.map((r, i) => (
          <Link
            key={i}
            to="/books"
            className="group bg-background p-7 md:p-8 flex flex-col gap-4 hover:bg-muted/40 transition-colors"
          >
            <span className="text-xs uppercase tracking-wider text-accent font-medium">{r.tag}</span>
            <h3
              className="font-serif text-xl md:text-2xl text-foreground leading-snug group-hover:text-accent transition-colors"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {r.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
            <span className="text-sm font-medium text-foreground mt-auto inline-flex items-center gap-1 pt-3">
              Read more <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  </section>
));

StudyMaterials.displayName = "StudyMaterials";
export default StudyMaterials;
