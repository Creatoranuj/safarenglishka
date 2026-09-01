/**
 * InstallsSection — Admin → Analytics → "App & Installs" tab.
 * Combines GitHub APK release download counts (anonymous totals) with
 * in-app install tracking (per-device, linked to students when logged in).
 */
import { useEffect, useState } from "react";
import { supabase } from "../../../integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { RefreshCw, Smartphone, Globe, Users, Activity } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { format } from "date-fns";
import ApkDownloadsCard from "./ApkDownloadsCard";
import type { Range } from "./RangePicker";

interface RecentInstall {
  device_id: string;
  platform: string;
  app_version: string | null;
  os_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  full_name: string | null;
  email: string | null;
}

interface InstallStats {
  total: number;
  android: number;
  ios: number;
  web: number;
  linked_students: number;
  unknown_devices: number;
  active_7d: number;
  active_30d: number;
  new_in_range: number;
  daily: { date: string; installs: number }[];
  recent: RecentInstall[];
}

const EMPTY: InstallStats = {
  total: 0, android: 0, ios: 0, web: 0, linked_students: 0, unknown_devices: 0,
  active_7d: 0, active_30d: 0, new_in_range: 0, daily: [], recent: [],
};

const Stat = ({ label, value, icon: Icon, sub }: {
  label: string; value: number; icon: React.ElementType; sub?: string;
}) => (
  <Card className="border-border">
    <CardContent className="pt-5 pb-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold text-foreground mt-1">{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className="p-2.5 rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </CardContent>
  </Card>
);

export default function InstallsSection({ range }: { range: Range }) {
  const [stats, setStats] = useState<InstallStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_get_install_stats", {
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
      });
      if (cancelled) return;
      if (!error && data) setStats({ ...EMPTY, ...(data as unknown as InstallStats) });
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total installs" value={stats.total} icon={Smartphone} sub="devices jinme app khula" />
        <Stat label="Android app" value={stats.android} icon={Smartphone} sub={`Web: ${stats.web.toLocaleString()}`} />
        <Stat label="Linked students" value={stats.linked_students} icon={Users} sub={`${stats.unknown_devices} devices bina login`} />
        <Stat label="Active (7d)" value={stats.active_7d} icon={Activity} sub={`30d: ${stats.active_30d.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              New installs ({stats.new_in_range.toLocaleString()} in range)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[220px] flex items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : stats.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground h-[220px] flex items-center justify-center">
                Is range me koi naya install nahi.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="installs" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <ApkDownloadsCard />
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent installs / opens</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Student</th>
                  <th className="text-left p-2 font-medium">Platform</th>
                  <th className="text-left p-2 font-medium">Version</th>
                  <th className="text-left p-2 font-medium">Installed</th>
                  <th className="text-left p-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Abhi koi install record nahi hua.
                    </td>
                  </tr>
                ) : stats.recent.map((r) => (
                  <tr key={`${r.device_id}-${r.last_seen_at}`} className="border-t border-border">
                    <td className="p-2">
                      <p className="font-medium truncate max-w-[180px]">{r.full_name || "Unknown device"}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{r.email || r.device_id}</p>
                    </td>
                    <td className="p-2">
                      <Badge variant={r.platform === "android" ? "default" : "outline"}>{r.platform}</Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.app_version || "—"}</td>
                    <td className="p-2 text-xs">{format(new Date(r.first_seen_at), "dd MMM yy")}</td>
                    <td className="p-2 text-xs">{format(new Date(r.last_seen_at), "dd MMM, hh:mm a")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
