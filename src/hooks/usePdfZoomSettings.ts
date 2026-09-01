import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PDF_ZOOM_CONTROLS_KEY = "pdf_zoom_controls";

/**
 * Admin-controlled switch for the reader's on-screen zoom buttons (− / % / +).
 *
 * Default is OFF: the reader opens at 100% and zoom is pinch-only, which keeps
 * the page full-bleed like the video player. Zoom never drops below 100%.
 */
export function usePdfZoomControlsEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["site_settings", PDF_ZOOM_CONTROLS_KEY],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PDF_ZOOM_CONTROLS_KEY)
        .maybeSingle();
      if (error) throw error;
      return String(data?.value ?? "false").toLowerCase() === "true";
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return data ?? false;
}
