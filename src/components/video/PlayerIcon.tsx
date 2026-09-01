import { cn } from "@/lib/utils";
import rotateAsset from "@/assets/video/rotate.svg";
import settingsAsset from "@/assets/video/settings.svg";

type PlayerIconKind = "rotate" | "settings";

interface PlayerIconProps {
  kind: PlayerIconKind;
  className?: string;
  alt?: string;
}

const SRC: Record<PlayerIconKind, string> = {
  rotate: rotateAsset,
  settings: settingsAsset,
};

/**
 * Branded video-player icons (CDN-hosted SVG).
 * Used in place of lucide Settings / Maximize so the player matches
 * the Safar English illustrated set.
 */
export const PlayerIcon = ({ kind, className, alt }: PlayerIconProps) => (
  <img
    src={SRC[kind]}
    alt={alt ?? kind}
    draggable={false}
    className={cn("select-none pointer-events-none object-contain", className)}
  />
);

export default PlayerIcon;
