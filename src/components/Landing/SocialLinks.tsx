import { useState, useEffect, forwardRef } from "react";
import { supabase } from "../../integrations/supabase/client";

const ICON_MAP: Record<string, { label: string; icon: string }> = {
  whatsapp_url: { label: "WhatsApp", icon: "💬" },
  telegram_url: { label: "Telegram", icon: "✈️" },
  instagram_url: { label: "Instagram", icon: "📸" },
  twitter_url: { label: "Twitter", icon: "🐦" },
  youtube_url: { label: "YouTube", icon: "🎬" },
  facebook_url: { label: "Facebook", icon: "📘" },
};

const SocialLinks = forwardRef<HTMLDivElement>((_, ref) => {
  const [links, setLinks] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    const fetchLinks = async () => {
      const { data } = await supabase
        .from("site_settings" as any)
        .select("key, value")
        .in("key", Object.keys(ICON_MAP));
      if (data) {
        setLinks((data as any[]).filter((r: any) => r.value && r.value.trim() !== ""));
      }
    };
    fetchLinks();
  }, []);

  if (links.length === 0) return null;

  return (
    <div ref={ref} className="flex items-center gap-3 flex-wrap">
      {links.map((link) => {
        const info = ICON_MAP[link.key];
        if (!info) return null;
        return (
          <a
            key={link.key}
            href={link.value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/10 text-sm text-muted-foreground hover:text-primary transition-colors"
            title={info.label}
          >
            <span>{info.icon}</span>
            <span className="hidden sm:inline">{info.label}</span>
          </a>
        );
      })}
    </div>
  );
});

SocialLinks.displayName = "SocialLinks";

export default SocialLinks;
