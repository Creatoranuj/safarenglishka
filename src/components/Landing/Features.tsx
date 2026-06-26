import { memo } from "react";
import { BookOpen, Video, Users, Award } from "lucide-react";

const features = [
  { icon: BookOpen, title: "Structured Curriculum", desc: "NCERT-aligned, exam-mapped courseware revised every term." },
  { icon: Video, title: "Live + Recorded", desc: "Weekly live classes plus full HD recordings you can revisit anytime." },
  { icon: Users, title: "Expert Mentors", desc: "Doctors, IITians, and senior educators teach every module." },
  { icon: Award, title: "Proven Results", desc: "Hundreds of students scoring 600+ in NEET each year." },
];

const Features = memo(() => (
  <section className="py-20 md:py-28 bg-muted/40 border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="max-w-2xl mb-14">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">Why Safar English Ka</p>
        <h2
          className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Everything serious students need — nothing they don't.
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        {features.map(({ icon: Icon, title, desc }, i) => (
          <div key={i} className="bg-background p-7 md:p-8 space-y-4">
            <Icon className="h-6 w-6 text-accent" strokeWidth={1.6} />
            <h3 className="font-serif text-xl text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
));

Features.displayName = "Features";
export default Features;
