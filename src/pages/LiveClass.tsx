import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Layout/Header";
import BottomNav from "../components/Layout/BottomNav";
import LivePlayer from "../components/live/LivePlayer";
import LiveChat from "../components/live/LiveChat";
import RaiseHandButton from "../components/live/RaiseHandButton";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Eye, ArrowLeft, Radio } from "lucide-react";

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  youtube_live_id: string;
  is_active: boolean;
  started_at: string | null;
}

const LiveClass = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(1);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }

    const fetchSession = async () => {
      const { data } = await (supabase as any)
        .from("live_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      setSession(data as LiveSession | null);
      setLoading(false);
    };

    fetchSession();

    // Subscribe to session changes (go live / end live)
    const sessionChannel = supabase
      .channel(`live-session-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        setSession(payload.new as LiveSession);
      })
      .subscribe();

    return () => { supabase.removeChannel(sessionChannel); };
  }, [sessionId, isAuthenticated, authLoading, navigate]);

  // Presence for viewer count
  useEffect(() => {
    if (!user || !sessionId) return;

    const presenceChannel = supabase.channel(`live-presence-${sessionId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [user, sessionId]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Joining live class...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Live session not found.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onMenuClick={() => {}} userName="" />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-16 lg:pb-0">
        {/* Left: Video + Info */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="p-3 md:p-4">
            <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>

            <LivePlayer youtubeId={session.youtube_live_id} title={session.title} />

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {session.is_active ? (
                    <Badge className="bg-destructive text-destructive-foreground gap-1.5 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-white" />
                      LIVE
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Ended</Badge>
                  )}
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Eye className="h-3.5 w-3.5" />
                    <span>{viewerCount} watching</span>
                  </div>
                </div>
                {session.is_active && (
                  <RaiseHandButton sessionId={session.id} />
                )}
              </div>
              <h1 className="text-lg font-bold text-foreground">{session.title}</h1>
              {session.description && (
                <p className="text-sm text-muted-foreground">{session.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat Panel */}
        <div className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col h-[50vh] lg:h-auto">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <Radio className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-foreground">Live Interaction</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <LiveChat sessionId={session.id} />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default LiveClass;
