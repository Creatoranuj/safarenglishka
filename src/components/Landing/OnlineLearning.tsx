import { memo } from "react";
import { Monitor, Clock, BookOpen } from "lucide-react";

const highlights = [
  { icon: Monitor, text: "Live & Recorded Classes" },
  { icon: Clock, text: "Learn at Your Own Pace" },
  { icon: BookOpen, text: "Digital Study Materials" },
];

const OnlineLearning = memo(() => (
  <section className="py-20 bg-muted/30">
    <div className="container mx-auto px-4">
      <div className="max-w-4xl mx-auto">
        {/* Text */}
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Hybrid Learning Experience
          </h2>
          <p className="text-muted-foreground text-lg">
            Access classes from anywhere with our integrated online platform. Watch lectures, download notes, and track progress — all in one place.
          </p>
          <div className="space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 bg-card p-4 rounded-xl border border-border">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-foreground font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
));

OnlineLearning.displayName = "OnlineLearning";
export default OnlineLearning;
