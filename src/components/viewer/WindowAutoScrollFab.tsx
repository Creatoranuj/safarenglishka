import { useEffect, useRef } from "react";
import AutoScrollFab from "./AutoScrollFab";

/**
 * AutoScroll FAB variant that scrolls the document (window) instead of an
 * inner element. Useful on pages that use the normal page scroll
 * (e.g. /downloads). Internally we hand AutoScrollFab a ref pointing at
 * `document.scrollingElement` (typically <html>), which honours scrollBy /
 * scrollTop just like any element.
 */
export default function WindowAutoScrollFab(
  props: Omit<React.ComponentProps<typeof AutoScrollFab>, "targetRef" | "iframeRef">
) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current = (document.scrollingElement ?? document.documentElement) as HTMLElement;
  }, []);
  return <AutoScrollFab targetRef={ref} {...props} />;
}
