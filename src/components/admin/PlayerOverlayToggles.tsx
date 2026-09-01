import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MonitorPlay } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { reportError } from "@/lib/sentry";
import { PLAYER_OVERLAY_KEYS } from "@/hooks/usePlayerOverlaySettings";
import { PDF_ZOOM_CONTROLS_KEY } from "@/hooks/usePdfZoomSettings";

const ROWS = [
  {
    key: PLAYER_OVERLAY_KEYS.infinity,
    label: "Infinity chip logo (bottom-left)",
    hint: "Bird logo jo YouTube ke \"More videos\" / ∞ chip ko dhakta hai.",
    defaultOn: true,
  },
  {
    key: PLAYER_OVERLAY_KEYS.youtubeLabel,
    label: "YouTube label mask (bottom-right)",
    hint: "\"BHARAT\" brand strip jo YouTube ka white watermark dhakta hai.",
    defaultOn: true,
  },
  {
    key: PDF_ZOOM_CONTROLS_KEY,
    label: "PDF zoom controls (− / % / +)",
    hint: "OFF rahe to PDF reader 100% par khulta hai aur zoom sirf pinch se hota hai (100% se neeche kabhi nahi).",
    defaultOn: false,
  },
] as const;

const PlayerOverlayToggles = () => {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(ROWS.map((r) => [r.key, r.defaultOn])),
  );
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ROWS.map((r) => r.key));
      if (cancelled) return;
      if (error) {
        reportError(error, { surface: "PlayerOverlayToggles.fetch" });
        toast.error("Player overlay settings load nahi hue");
      } else if (data) {
        const next: Record<string, boolean> = {};
        for (const row of data) next[row.key] = String(row.value ?? "").toLowerCase() === "true";
        setValues((prev) => ({ ...prev, ...next }));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = async (key: string, next: boolean) => {
    setSavingKey(key);
    const prev = values[key];
    setValues((v) => ({ ...v, [key]: next }));
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value: next ? "true" : "false", updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingKey(null);
    if (error) {
      setValues((v) => ({ ...v, [key]: prev }));
      reportError(error, { surface: "PlayerOverlayToggles.save" });
      toast.error("Save nahi hua: " + error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["site_settings", "player_overlays"] });
    await queryClient.invalidateQueries({ queryKey: ["site_settings", PDF_ZOOM_CONTROLS_KEY] });
    toast.success(next ? "ON" : "OFF");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="h-5 w-5" />
          Player & Reader Controls
        </CardTitle>
        <CardDescription>
          Player ke branded overlays aur PDF reader ke zoom buttons ko hide / show karein. Ye site-wide lagu hota hai.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          ROWS.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor={row.key} className="text-sm font-medium">{row.label}</Label>
                <p className="text-xs text-muted-foreground mt-1">{row.hint}</p>
              </div>
              <Switch
                id={row.key}
                checked={values[row.key]}
                disabled={savingKey === row.key}
                onCheckedChange={(checked) => void toggle(row.key, checked)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default PlayerOverlayToggles;
