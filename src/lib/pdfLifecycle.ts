export type PdfLifecyclePhase = "connecting" | "indexing" | "downloading" | "rendering" | "retrying" | "ready";

export type PdfLifecycleDetail = {
  readerId?: string;
  percent?: number;
  phase?: PdfLifecyclePhase;
  measured?: boolean;
  message?: string;
  [key: string]: unknown;
};

export const pdfLifecycleMatches = (event: Event, readerId?: string): boolean => {
  if (!readerId) return true;
  return (event as CustomEvent<PdfLifecycleDetail>).detail?.readerId === readerId;
};

export const emitPdfLifecycle = (type: string, readerId?: string, detail: PdfLifecycleDetail = {}): void => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(type, { detail: { ...detail, readerId } }));
  } catch {
    // Lifecycle telemetry must never interrupt the reader.
  }
};