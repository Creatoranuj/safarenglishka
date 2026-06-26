import { cn } from "@/lib/utils";
import rotateAsset from "@/assets/video/rotate.svg.asset.json";
import settingsAsset from "@/assets/video/settings.svg.asset.json";

type PlayerIconKind = "rotate" | "settings";

interface PlayerIconProps {
  kind: PlayerIconKind;
  className?: string;
  alt?: string;
}

const SRC: Record<PlayerIconKind, string> = {
  rotate: rotateAsset.url,
  settings: settingsAsset.url,
};

/**
 * Branded video-player icons (CDN-hosted SVG).
 * Used in place of lucide Settings / Maximize so the player matches
 * the Safar English Ka illustrated set.
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
