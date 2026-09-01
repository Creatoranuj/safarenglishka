import { useEffect, useState, type RefObject } from "react";

/**
 * IntersectionObserver-driven mount state for one PDF page slot.
 *
 * `render === false` means the page canvas is unmounted (bitmap released) while
 * a placeholder keeps the scroll height stable. Extracted from FastPdfReader so
 * the release behavior can be asserted at runtime.
 */
export function usePageSlotVisibility({
  pageNumber,
  elementRef,
  rootRef,
  releaseWhenDistant,
  onVisible,
}: {
  pageNumber: number;
  elementRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  releaseWhenDistant: boolean;
  onVisible: (page: number) => void;
}): boolean {
  const [render, setRender] = useState(pageNumber <= 2);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRender(true);
            onVisible(pageNumber);
          } else if (releaseWhenDistant) {
            setRender(false);
          }
        }
      },
      { root: rootRef.current ?? null, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, releaseWhenDistant, rootRef, elementRef, onVisible]);

  return render;
}
