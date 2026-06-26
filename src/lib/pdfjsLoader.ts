/**
 * Singleton loader for pdfjs-dist.
 *
 * Why: LessonView and FastPdfReader were each calling
 * `import("pdfjs-dist")` + setting `GlobalWorkerOptions.workerSrc` independently.
 * Two effects of that pattern:
 *   1. Duplicate worker spawn — pdfjs internally creates a Worker for every
 *      `getDocument()` call, but `workerSrc` being reassigned mid-flight can
 *      tear down an in-flight worker on slow networks.
 *   2. Wasted bytes on cold start — Vite splits pdfjs into one chunk, but
 *      multiple importers race the resolver before sharing it.
 *
 * Both call-sites should `await loadPdfjs()` and use the returned module.
 */
let cached: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  if (cached) return cached;
  cached = (async () => {
    const pdfjs: any = await import("pdfjs-dist");
    // Only configure worker once. `?url` import returns a string the browser
    // can fetch directly; pdfjs then spawns the worker from that URL.
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      try {
        const workerSrc = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      } catch (e) {
        // Worker is optional — pdfjs falls back to fake worker (slower but functional).
        console.warn("[pdfjsLoader] worker init failed, using fake worker:", e);
      }
    }
    return pdfjs;
  })();
  // If the import throws, allow a retry on the next call rather than caching
  // a permanently-rejected promise.
  cached.catch(() => { cached = null; });
  return cached;
}
