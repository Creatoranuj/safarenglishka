import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../integrations/supabase/client";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Calendar, Clock, ChevronRight } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";

interface UpcomingSession {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
}

const formatScheduledTime = (iso: string) => {
  const date = new Date(iso);
  const timeStr = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${timeStr}`;
  if (isTomorrow(date)) return `Tomorrow, ${timeStr}`;
  return format(date, "MMM d, ") + timeStr;
};

const UpcomingLiveSessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date().toISOString();
      const { data } = await (supabase as any)
        .from("live_sessions")
        .select("id, title, description, scheduled_at")
        .eq("is_active", false)
        .is("ended_at", null)
        .not("scheduled_at", "is", null)
        .gt("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(5);
      if (data) setSessions(data as UpcomingSession[]);
    };
    fetch();
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Upcoming Live Classes
        </h3>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {sessions.map((session) => (
          <Card
            key={session.id}
            className="min-w-[220px] max-w-[240px] flex-shrink-0 border border-border hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => navigate(`/live/${session.id}`)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-1 mb-2">
                <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30 bg-primary/5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatScheduledTime(session.scheduled_at)}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-foreground line-clamp-2 mb-2">{session.title}</p>
              {session.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-1">{session.description}</p>
              )}
              <div className="flex items-center justify-end mt-2">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5 text-primary px-2">
                  Set Reminder <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default UpcomingLiveSessions;
