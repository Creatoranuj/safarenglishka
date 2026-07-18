import { memo } from "react";
import { Send, Youtube } from "lucide-react";
import { tapHaptic } from "@/lib/native/haptics";

// Logical touchpoint: placed AFTER the pitch (WhyChooseUs) and BEFORE the lead form.
// Students who are convinced but not ready to submit a form still convert here —
// low-friction "follow" instead of "sign up".
const CommunityStrip = memo(() => {
  return (
    <section aria-label="Join our community" className="py-14 md:py-16 bg-muted/30 border-y border-border/60">
      <div className="container mx-auto max-w-5xl px-6 lg:px-10 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Stay in the loop
        </p>
        <h2
          className="font-serif text-2xl md:text-3xl text-foreground mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Free lessons, daily updates, doubt help
        </h2>
        <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto mb-8">
          Join <strong className="text-foreground">Safar English ka</strong> on Telegram for daily
          practice sets and class schedules. Subscribe on YouTube for full free lessons.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://t.me/safarenglishka"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { void tapHaptic("light"); }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-brand-telegram text-white text-sm font-medium hover:bg-brand-telegram-hover active:scale-[0.97] transition-all duration-150 shadow-sm"
          >
            <Send className="h-4 w-4" />
            Join Telegram
          </a>
          <a
            href="https://youtube.com/@safarenglishka"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { void tapHaptic("light"); }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-brand-youtube text-white text-sm font-medium hover:bg-brand-youtube-hover active:scale-[0.97] transition-all duration-150 shadow-sm"
          >
            <Youtube className="h-4 w-4" />
            Subscribe on YouTube
          </a>
        </div>
      </div>
    </section>
  );
});
CommunityStrip.displayName = "CommunityStrip";

export default CommunityStrip;
