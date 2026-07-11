import { useEffect, useRef, useState } from "react";
import PlayerControls from "../components/video/PlayerControls";
import { useAutoHideControls } from "../components/video/hooks/useAutoHideControls";

// CDN-hosted 5s test clip generated via videogen. Self-hosted so the player
// chrome can be exercised without a YouTube sign-in (sandbox limitation).
const TEST_VIDEO_URL =
  "/__l5e/assets-v1/c427c784-056c-4c4f-9bab-234726b75970/tap-toggle.mp4";

/**
 * /player-test — sandbox-only test harness for the Phase 1 tap-toggle fix.
 *
 * Why this page exists:
 *   MahimaVideoPlayer wraps `react-player/youtube`, which refuses to play in
 *   the Lovable sandbox preview because YouTube blocks unauthenticated
 *   embeds. On a real device it works. To verify the shared `useAutoHideControls`
 *   + `PlayerControls` tap-toggle logic without YouTube, this page mounts the
 *   same hook + chrome on a plain `<video>` element pointed at a self-hosted
 *   8-second test clip.
 *
 * What it validates:
 *   - Single-tap on the surface toggles chrome instantly (no double-fire).
 *   - After a user tap-hide while playing, transient buffering / rotation
 *     does NOT yank the chrome back on.
 *   - Auto-hide after 3s of inactivity while playing.
 */
export default function PlayerTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const { visible, kick, toggle } = useAutoHideControls({
    isPlaying: playing,
    isLocked: isBuffering,
    delay: 3000,
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onLoaded = () => setDuration(v.duration || 0);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onProgress = () => {
      try {
        if (v.buffered.length && v.duration) {
          setBuffered(v.buffered.end(v.buffered.length - 1) / v.duration);
        }
      } catch {/* noop */}
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("progress", onProgress);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("progress", onProgress);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
    kick();
  };

  const onSurfaceClick = () => {
    toggle();
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">Player Tap-Toggle Test (Phase 1)</h1>
      <p className="text-xs text-muted-foreground max-w-md text-center">
        Tap the video to toggle chrome. While playing, chrome auto-hides after 3s.
        After a manual hide, transient buffering should NOT bring chrome back.
      </p>
      <div
        className="relative w-full max-w-[720px] aspect-video bg-black rounded-xl overflow-hidden select-none"
        style={{ touchAction: "manipulation" }}
        onClick={onSurfaceClick}
      >
        <video
          ref={videoRef}
          src={TEST_VIDEO_URL}
          playsInline
          className="w-full h-full"
          preload="metadata"
          onContextMenu={(e) => e.preventDefault()}
        />
        <PlayerControls
          title="Tap-toggle test clip"
          isPlaying={playing}
          isFullscreen={isFullscreen}
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          speed={speed}
          availableSpeeds={[0.5, 1, 1.25, 1.5, 2]}
          quality={quality}
          availableQualities={["auto", "hd720", "large"]}
          visible={visible}
          onBack={() => window.history.back()}
          onPlayPause={togglePlay}
          onSeek={(s) => { if (videoRef.current) videoRef.current.currentTime = s; kick(); }}
          onSpeedChange={(s) => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; }}
          onQualityChange={setQuality}
          onToggleFullscreen={() => setIsFullscreen((f) => !f)}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        chrome-visible: <span className="font-mono">{String(visible)}</span> ·
        playing: <span className="font-mono">{String(playing)}</span> ·
        buffering: <span className="font-mono">{String(isBuffering)}</span>
      </div>
    </div>
  );
}