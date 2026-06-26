import { memo } from "react";
import classroomAvif from "../../assets/landing/classroom_interaction.avif";
import classroomWebp from "../../assets/landing/classroom_interaction.webp";
import { Picture } from "../ui/Picture";

const points = [
  { n: "01", t: "Experienced faculty", d: "Every teacher is a domain expert with 10+ years of NEET / board coaching." },
  { n: "02", t: "Small batches", d: "Capped class sizes ensure each student is seen, heard, and corrected." },
  { n: "03", t: "Weekly tests", d: "Chapter-wise assessments with detailed performance analytics." },
  { n: "04", t: "Doubt clearing", d: "Dedicated live sessions and 1:1 WhatsApp support every single week." },
];

const WhyChooseUs = memo(() => (
  <section className="py-20 md:py-28 bg-background border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-sm border border-border/60">
            <Picture
              srcAvif={classroomAvif}
              srcWebp={classroomWebp}
              srcFallback={classroomWebp}
              alt="Faculty teaching in classroom"
              className="w-full h-auto object-cover aspect-[4/5]"
              width={1200}
              height={1500}
            />
          </div>
        </div>

        <div className="lg:col-span-7 space-y-10">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">Our method</p>
            <h2
              className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Built on rigor, not gimmicks.
            </h2>
            <p className="text-lg text-muted-foreground mt-5 leading-relaxed">
              We combine the discipline of traditional coaching with modern pedagogy and technology — so every hour of study compounds.
            </p>
          </div>

          <ul className="divide-y divide-border/60 border-y border-border/60">
            {points.map((p) => (
              <li key={p.n} className="py-6 grid grid-cols-[auto_1fr] gap-6 items-baseline">
                <span className="font-serif text-2xl text-accent tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>
                  {p.n}
                </span>
                <div>
                  <h3 className="font-medium text-lg text-foreground mb-1">{p.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
));

WhyChooseUs.displayName = "WhyChooseUs";
export default WhyChooseUs;
