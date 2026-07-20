import { useEffect, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { useAutoScroll } from "../../hooks/useAutoScroll";

interface Props {
  targetRef?: React.RefObject<HTMLElement | null>;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Vertical offset above the bottom edge (px). Default 84 (above Save FAB). */
  bottomOffset?: number;
  /** Notified whenever autoscroll active state changes (so chrome can stay pinned). */
  onActiveChange?: (active: boolean) => void;
}

const PRESETS = [0.1, 0.2, 0.5, 1, 1.5, 2, 3, 5];

/**
 * Floating autoscroll button.
 * - Tap → toggle on/off
 * - Long-press (≥350ms) → open speed picker (presets + fine slider, 0.1 step)
 */
export default function AutoScrollFab({ targetRef, iframeRef, bottomOffset = 84, onActiveChange }: Props) {
  const { active, speed, setSpeed, toggle, pause, resume } = useAutoScroll({ targetRef, iframeRef });
  const [open, setOpen] = useState(false);
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const heldPause = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressed.current = false;
    heldPause.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (active) {
      // Hold-to-pause: after a tiny threshold, pause the scroll without
      // changing `active`. Release will resume at the same speed.
      pressTimer.current = window.setTimeout(() => {
        heldPause.current = true;
        pause();
      }, 140);
    } else {
      // Idle → long-press opens speed picker.
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        setOpen(true);
      }, 280);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Cancel long-press only on a deliberate drag (>12px), not tiny jitter.
    if (!startPos.current || longPressed.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > 12 && pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (heldPause.current) {
      // Was paused while held → resume at same speed, don't toggle off.
      resume();
    } else if (!longPressed.current) {
      toggle();
    }
    heldPause.current = false;
    startPos.current = null;
  };

  return (
    <>
      <button
        type="button"
        aria-label={active ? "Stop autoscroll" : "Start autoscroll"}
        aria-pressed={active}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        data-floating-fab="true"
        className={`safe-area-bottom fixed right-5 z-40 flex h-12 w-12 select-none items-center justify-center rounded-full shadow-lg ring-1 ring-black/10 transition-all active:scale-95 ${
          active
            ? "bg-primary text-primary-foreground ring-2 ring-primary animate-pulse"
            : "bg-card text-foreground"
        }`}
        style={{ bottom: bottomOffset }}
      >
        <ChevronsDown
          className={`h-6 w-6 ${active ? "animate-bounce" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Autoscroll speed</h3>
              <span className="text-xs text-muted-foreground">{speed.toFixed(1)} px/frame</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-4 grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSpeed(p)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    Math.abs(speed - p) < 0.05
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  {p}x
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
