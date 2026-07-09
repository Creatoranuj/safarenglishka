import { memo } from "react";

const quotes = [
  {
    q: "Structured weekly practice ne mera confidence hi badal diya. Interview me English ab dar nahi lagti.",
    n: "Priya Sharma",
    r: "CG Lecturer Selected · 2025",
  },
  {
    q: "Doubt sessions on WhatsApp were a game-changer. My teachers actually knew my weak chapters.",
    n: "Aryan Mishra",
    r: "Class 12 · 96.4% Board",
  },
  {
    q: "Grammar notes alone are worth ten times the price. Clean, complete, and exam-ready.",
    n: "Sneha Patel",
    r: "Class 11 · English Topper",
  },
];

const Testimonials = memo(() => (
  <section className="py-20 md:py-28 bg-background border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="max-w-2xl mb-14">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">Student voices</p>
        <h2
          className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Results that speak for themselves.
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-border">
        {quotes.map((t, i) => (
          <figure key={i} className="bg-background p-8 md:p-10 flex flex-col gap-6">
            <span
              className="font-serif text-5xl text-accent leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <blockquote className="text-lg text-foreground leading-relaxed flex-1">{t.q}</blockquote>
            <figcaption className="pt-4 border-t border-border/60">
              <div className="font-medium text-foreground">{t.n}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{t.r}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  </section>
));

Testimonials.displayName = "Testimonials";
export default Testimonials;
