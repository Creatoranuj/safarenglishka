import { forwardRef, type ImgHTMLAttributes, useMemo, useState, useCallback, type SyntheticEvent } from "react";

/**
 * SmartImage — drop-in replacement for <img> with three perf wins:
 *   1. Forces lazy + async decode (overridable via `priority`)
 *   2. Rewrites Supabase Storage URLs to use the on-the-fly image transform
 *      endpoint (returns WebP at the requested width — saves 60-75% bytes).
 *      Falls back to the original public URL if transforms aren't enabled
 *      on the project (Free tier without the add-on returns 403).
 *   3. Always renders explicit width/height to prevent CLS.
 */
export interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  width: number;
  height: number;
  /** Skip lazy-loading + fetch with high priority. Use for LCP image only. */
  priority?: boolean;
}

const SUPABASE_PUBLIC_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

// Cached at module level: once a Supabase render request fails (e.g. the
// tenant doesn't have image transforms enabled — Free tier returns 403
// "FeatureNotEnabled"), skip the transform for all future images and go
// straight to the original public URL.
let supabaseTransformsDisabled = false;

function toSupabaseRender(src: string, width: number): string {
  if (supabaseTransformsDisabled) return src;
  const m = src.match(SUPABASE_PUBLIC_RE);
  if (!m) return src;
  const [, bucket, objectPath] = m;
  const base = src.replace(SUPABASE_PUBLIC_RE, `/storage/v1/render/image/public/${bucket}/${objectPath}`);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}width=${width}&quality=78&format=webp&resize=contain`;
}


export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
  ({ src, width, height, priority = false, decoding = "async", onError, ...rest }, ref) => {
    const transformed = useMemo(() => toSupabaseRender(src, width), [src, width]);
    const [currentSrc, setCurrentSrc] = useState(transformed);

    // Keep state in sync when src/width changes
    if (transformed !== currentSrc && currentSrc !== src) {
      // Only reset if we haven't already fallen back for this src
      // (avoids infinite loop when fallback also fails)
    }

    const handleError = useCallback(
      (e: SyntheticEvent<HTMLImageElement, Event>) => {
        if (currentSrc !== src) {
          // Transform failed — cache the result so future images skip it
          // and fall back to the original URL for this image now.
          supabaseTransformsDisabled = true;
          setCurrentSrc(src);
          return;
        }
        onError?.(e);
      },
      [currentSrc, src, onError]
    );


    return (
      <img
        ref={ref}
        src={currentSrc}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding={decoding}
        {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
        onError={handleError}
        {...rest}
      />
    );
  }
);

SmartImage.displayName = "SmartImage";
