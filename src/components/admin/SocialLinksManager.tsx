import { useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { toast } from "sonner";
import { Save, Loader2, ExternalLink } from "lucide-react";

const SOCIAL_KEYS = [
  { key: "whatsapp_url", label: "WhatsApp", placeholder: "https://wa.me/919876543210", icon: "💬" },
  { key: "telegram_url", label: "Telegram", placeholder: "https://t.me/mahimaacademy", icon: "✈️" },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/mahimaacademy", icon: "📸" },
  { key: "twitter_url", label: "Twitter / X", placeholder: "https://x.com/mahimaacademy", icon: "🐦" },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@mahimaacademy", icon: "🎬" },
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/mahimaacademy", icon: "📘" },
];

const SocialLinksManager = () => {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchLinks = async () => {
      const { data, error } = await supabase
        .from("site_settings" as any)
        .select("key, value")
        .in("key", SOCIAL_KEYS.map(s => s.key));

      if (error) {
        console.error("Failed to fetch social links:", error);
        toast.error("Failed to load social links");
      } else if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((row: any) => { map[row.key] = row.value || ""; });
        setLinks(map);
      }
      setLoading(false);
    };
    fetchLinks();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const { key } of SOCIAL_KEYS) {
        const value = links[key] || "";
        await (supabase.from("site_settings" as any) as any)
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", key);
      }
      toast.success("Social links saved!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          Social Media Links
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          These links will appear in the website footer for students to connect with you.
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SOCIAL_KEYS.map(({ key, label, placeholder, icon }) => (
            <div key={key} className="space-y-1.5">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <span>{icon}</span> {label}
              </Label>
              <Input
                placeholder={placeholder}
                value={links[key] || ""}
                onChange={(e) => setLinks(prev => ({ ...prev, [key]: e.target.value }))}
                className="bg-background"
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Social Links
        </Button>
      </CardContent>
    </Card>
  );
};

export default SocialLinksManager;
