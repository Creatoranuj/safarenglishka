/**
 * BrandMark — Safar English Ka mark served from /brand/safar-mark.png.
 * The asset is bundled into the app shell (Capacitor ships it as a local
 * file under the WebView origin), so the network cost is effectively zero
 * while keeping the JS initial-entry chunk lean — replaces the prior inline
 * data URL added ~6–7KB of base64 to every cold start.
 */
import { memo } from "react";

const NB_MARK_SRC = "/brand/safar-mark.png";

interface BrandMarkProps {
  className?: string;
  size?: number;
  decorative?: boolean;
  title?: string;
}

const BrandMarkInner = ({
  className,
  size = 64,
  decorative = false,
  title = "Safar English Ka",
}: BrandMarkProps) => (
  <img
    src={NB_MARK_SRC}
    width={size}
    height={size}
    alt={decorative ? "" : title}
    aria-hidden={decorative || undefined}
    className={className}
    draggable={false}
    decoding="async"
    {...({ fetchpriority: "high" } as Record<string, string>)}
    style={{ objectFit: "contain" }}
  />
);

export const BrandMark = memo(BrandMarkInner);
export default BrandMark;
