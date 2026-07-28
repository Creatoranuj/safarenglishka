import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../integrations/supabase/client";

const ICON_MAP: Record<string, { label: string; icon: string }> = {
  whatsapp_url: { label: "WhatsApp", icon: "💬" },
  telegram_url: { label: "Telegram", icon: "✈️" },
  instagram_url: { label: "Instagram", icon: "📸" },
  twitter_url: { label: "Twitter", icon: "🐦" },
  youtube_url: { label: "YouTube", icon: "🎬" },
  facebook_url: { label: "Facebook", icon: "📘" },
};

const KEYS = Object.keys(ICON_MAP);

const SocialLinks = forwardRef<HTMLDivElement>((_, ref) => {
  const { data: links = [] } = useQuery({
    queryKey: ["site_settings", "social_links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", KEYS);
      if (error) throw error;
      return (data ?? []).filter(
        (r: { key: string; value: string | null }) => !!r.value && r.value.trim() !== ""
      ) as { key: string; value: string }[];
    },
    // Landing-page chrome — safe to cache aggressively; admin updates
    // propagate on next cold load / manual refresh.
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 24 * 60 * 60 * 1000, // 24h
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

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
