import { useState, useCallback } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "../ui/button";
import MahimaGhostPlayer from "../video/MahimaGhostPlayer";

interface LivePlayerProps {
  youtubeId: string;
  title: string;
}

const LivePlayer = ({ youtubeId, title }: LivePlayerProps) => {
  const [playerKey, setPlayerKey] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  const handleReload = useCallback(() => {
    setShowFallback(false);
    setPlayerKey(k => k + 1);
  }, []);

  const videoUrl = `https://www.youtube.com/live/${youtubeId}`;

  return (
    <div className="relative w-full">
      <MahimaGhostPlayer
        key={playerKey}
        videoUrl={videoUrl}
        title={title}
      />

      {/* Retry / fallback overlay */}
      {showFallback && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-3 rounded-xl">
          <p className="text-white/80 text-sm">Stream not loading?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleReload}>
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-white border-white/30" asChild>
              <a href={`https://www.youtube.com/watch?v=${youtubeId}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Watch on YouTube
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Reload button — always accessible in corner */}
      <button
        onClick={handleReload}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white transition-colors"
        title="Reload stream"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default LivePlayer;
