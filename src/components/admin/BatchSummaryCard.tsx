/**
 * BatchSummaryCard — Admin dashboard summary: kaun se batch me kitne
 * students hain, kitne active, average progress. "View" par Batch Monitor.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { GraduationCap, RefreshCw, ArrowRight } from "lucide-react";

interface BatchRow {
  course_id: number;
  title: string;
  students: number;
  active_students: number;
  avg_progress: number;
}

const BatchSummaryCard = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_batch_summary");
    if (!error && data) setRows(data as unknown as BatchRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalStudents = rows.reduce((s, r) => s + Number(r.students || 0), 0);

  return (
    <Card className="border-border overflow-hidden">
      <CardHeader className="pb-3 gap-2 space-y-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2 min-w-0">
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Batch-wise Students</span>
            <Badge variant="secondary" className="shrink-0">{totalStudents}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" aria-label="Refresh batches" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" className="gap-1 hidden sm:inline-flex" onClick={() => navigate("/admin/batch-monitor")}>
              Batch Monitor <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1 w-full sm:hidden" onClick={() => navigate("/admin/batch-monitor")}>
          Batch Monitor <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Batch</th>
                <th className="text-right p-2 font-medium">Students</th>
                <th className="text-right p-2 font-medium">Active</th>
                <th className="text-right p-2 font-medium">Avg %</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Koi batch nahi mila.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.course_id} className="border-t border-border">
                  <td className="p-2 font-medium truncate max-w-[220px]">{r.title}</td>
                  <td className="p-2 text-right tabular-nums">{Number(r.students).toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-600">{Number(r.active_students).toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">{Number(r.avg_progress ?? 0)}%</td>
                  <td className="p-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigate("/admin/batch-monitor")}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default BatchSummaryCard;
