import { useMemo, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, Facebook, Linkedin, Twitter, Shield } from "lucide-react";
import logoIcon from "../../assets/branding/logo_icon_web.webp";
import WhatsAppIcon from "../common/WhatsAppIcon";
import { WHATSAPP_NUMBER } from "../common/WhatsAppButton";

const Footer = forwardRef<HTMLElement>((_, ref) => {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const cols = [
    {
      title: "Learn",
      links: [
        { l: "All Courses", to: "/courses" },
        { l: "NEET Prep", to: "/courses" },
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
      className="bg-secondary text-secondary-foreground border-t border-white/10"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      {/* Main grid */}
      <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-16 md:py-20">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Brand — 4 cols */}
          <div className="lg:col-span-4 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src={logoIcon}
                alt="Safar English Ka"
                className="h-10 w-10 rounded-full object-contain"
                width={40}
                height={40}
                loading="lazy"
              />
              <span
                className="font-serif text-xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Safar English Ka
              </span>
            </div>
            <p className="text-sm text-secondary-foreground/60 leading-relaxed max-w-xs">
              Rigorous NEET and board exam preparation, built for serious Indian students. Editorial quality, classroom discipline, modern delivery.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors" aria-label="WhatsApp">
                <WhatsAppIcon className="text-[#25D366]" size={16} />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors" aria-label="Facebook">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors" aria-label="Twitter">
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Link columns — 8 cols / 4 columns */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {cols.map((col) => (
              <div key={col.title}>
                <h4 className="font-medium text-xs uppercase tracking-[0.15em] text-secondary-foreground/90 mb-5">{col.title}</h4>
                <ul className="space-y-3 text-sm">
                  {col.links.map((link) => (
                    <li key={link.l}>
                      <Link to={link.to} className="text-secondary-foreground/60 hover:text-secondary-foreground transition-colors">
                        {link.l}
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
            <a href="mailto:info@safarenglishka.com" className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors">
              <Mail className="h-4 w-4" />
              info@safarenglishka.com
            </a>
            <a href={`tel:+${WHATSAPP_NUMBER}`} className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors">
              <Phone className="h-4 w-4" />
              +91 75188 56804
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-secondary-foreground/50 border border-white/10 rounded px-2.5 py-1.5 self-start md:self-auto">
            <Shield className="h-3 w-3" />
            <span>Razorpay Secure Payments</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-secondary-foreground/40">
            © {currentYear} Safar English Ka. All rights reserved.
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
