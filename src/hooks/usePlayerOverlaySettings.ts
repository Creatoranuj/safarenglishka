import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PLAYER_OVERLAY_KEYS = {
  infinity: "player_infinity_overlay",
  youtubeLabel: "player_youtube_label_overlay",
} as const;

export interface PlayerOverlaySettings {
  /** Bird logo that covers the YouTube "More videos" / infinity chip. */
  showInfinityOverlay: boolean;
  /** Bottom-right "Bharat" mask that covers the YouTube white label watermark. */
  showYoutubeLabelOverlay: boolean;
}

const DEFAULTS: PlayerOverlaySettings = {
  showInfinityOverlay: true,
  showYoutubeLabelOverlay: true,
};

const isOn = (value?: string | null) => String(value ?? "true").toLowerCase() !== "false";

/**
 * Global (site-wide) toggles for the branded overlays drawn on top of the
 * YouTube player. Cached aggressively — these change very rarely.
 */
export function usePlayerOverlaySettings() {
  const { data } = useQuery({
    queryKey: ["site_settings", "player_overlays"],
    queryFn: async (): Promise<PlayerOverlaySettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [PLAYER_OVERLAY_KEYS.infinity, PLAYER_OVERLAY_KEYS.youtubeLabel]);
      if (error) throw error;
      const map = new Map((data ?? []).map((row) => [row.key, row.value]));
      return {
        showInfinityOverlay: isOn(map.get(PLAYER_OVERLAY_KEYS.infinity)),
        showYoutubeLabelOverlay: isOn(map.get(PLAYER_OVERLAY_KEYS.youtubeLabel)),
      };
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return data ?? DEFAULTS;
}
