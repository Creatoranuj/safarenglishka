import { useMemo, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, Send, Youtube, Shield, ArrowUpRight, Sparkles } from "lucide-react";
import logoIcon from "../../assets/branding/nb-mark.webp";
import WhatsAppIcon from "../common/WhatsAppIcon";
import { WHATSAPP_NUMBER } from "../common/WhatsAppButton";

const Footer = forwardRef<HTMLElement>((_, ref) => {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const phoneDisplay = "+91 91258 38309";

  const cols = [
    {
      title: "Learn",
      links: [
        { l: "All Courses", to: "/courses" },
        { l: "CG Lecturer Prep", to: "/courses" },
        { l: "Class 11–12", to: "/courses" },
        { l: "Live Classes", to: "/courses" },
      ],
    },
    {
      title: "Resources",
      links: [
        { l: "Free Books", to: "/books" },
        { l: "Notes Library", to: "/books" },
        { l: "Mock Tests", to: "/books" },
        { l: "Doubt Forum", to: "/doubts" },
      ],
    },
    {
      title: "Company",
      links: [
        { l: "About", to: "/" },
        { l: "Contact", to: "/" },
        { l: "Careers", to: "/" },
        { l: "Blog", to: "/" },
      ],
    },
    {
      title: "Legal",
      links: [
        { l: "Terms of Service", to: "/" },
        { l: "Privacy Policy", to: "/privacy" },
        { l: "Refund Policy", to: "/" },
        { l: "Delete Account", to: "/delete-account" },
      ],
    },
  ];

  return (
    <footer
      ref={ref}
      className="relative bg-secondary text-secondary-foreground border-t border-white/10 overflow-hidden"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      {/* Ambient editorial gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, hsl(var(--primary) / 0.25), transparent 70%)",
        }}
      />

      {/* CTA band */}
      <div className="relative border-b border-white/10">
        <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-10 md:py-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-secondary-foreground/60 mb-3">
              <Sparkles className="h-3 w-3" /> Learn with intent
            </div>
            <h3
              className="text-2xl md:text-3xl leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Serious English. Serious results.
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
            >
              Start free <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-secondary-foreground/90 hover:bg-white/5 transition"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="relative container mx-auto max-w-7xl px-6 lg:px-10 py-16 md:py-20">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Brand — 4 cols */}
          <div className="lg:col-span-4 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src={logoIcon}
                alt="Safar English"
                className="h-11 w-11 rounded-full object-contain ring-1 ring-white/10 bg-white/5 p-1"
                width={44}
                height={44}
                loading="lazy"
              />
              <span
                className="font-serif text-xl tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Safar English
              </span>
            </div>
            <p className="text-sm text-secondary-foreground/60 leading-relaxed max-w-xs">
              Roz ek chota safar, bada change. Raj VIP Sir ke saath 599+ free spoken English
              lessons on <span className="text-secondary-foreground">YouTube · @safarenglishka</span> —
              plus live doubt classes and structured courses in the app.
            </p>

            <div className="flex items-center gap-2 pt-2">
              {[
                {
                  href: `https://wa.me/${WHATSAPP_NUMBER}`,
                  label: "WhatsApp — Safar English",
                  icon: <WhatsAppIcon size={16} />,
                  hover: "hover:bg-whatsapp hover:text-white hover:border-whatsapp",
                },
                {
                  href: "https://t.me/safarenglishka",
                  label: "Telegram — @safarenglishka",
                  icon: <Send className="h-4 w-4" />,
                  hover: "hover:bg-[#229ED9] hover:text-white hover:border-[#229ED9]",
                },
                {
                  href: "https://youtube.com/@safarenglishka",
                  label: "YouTube — @safarenglishka",
                  icon: <Youtube className="h-4 w-4" />,
                  hover: "hover:bg-[#FF0000] hover:text-white hover:border-[#FF0000]",
                },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2.5 rounded-full bg-white/5 border border-white/10 text-secondary-foreground/80 transition-colors ${s.hover}`}
                  aria-label={s.label}
                  title={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {cols.map((col) => (
              <div key={col.title}>
                <h4 className="font-medium text-[11px] uppercase tracking-[0.18em] text-secondary-foreground/80 mb-5">
                  {col.title}
                </h4>
                <ul className="space-y-3 text-sm">
                  {col.links.map((link) => (
                    <li key={link.l}>
                      <Link
                        to={link.to}
                        className="group inline-flex items-center gap-1 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
                      >
                        <span>{link.l}</span>
                        <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Contact strip */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-6">
            <a
              href="mailto:info@safarenglish.com"
              className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              info@safarenglish.com
            </a>
            <a
              href={`tel:+${WHATSAPP_NUMBER}`}
              className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
            >
              <Phone className="h-4 w-4" />
              {phoneDisplay}
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-secondary-foreground/50 border border-white/10 rounded-full px-3 py-1.5 self-start md:self-auto">
            <Shield className="h-3 w-3" />
            <span>Razorpay Secure Payments</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/10">
        <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-secondary-foreground/40">
            © {currentYear} Safar English. All rights reserved.
          </p>
          <p className="text-xs text-secondary-foreground/40">
            Made with care for Indian students.
          </p>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";
export default Footer;
