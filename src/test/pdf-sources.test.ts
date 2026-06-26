/**
 * Integration test: PDF source routing.
 *
 * Verifies that each notes delivery method the app supports — CDN/jsDelivr,
 * Google Drive, Notion, Vercel (NaveenBharat) storage, GitHub storage CDN, and
 * generic signed URLs — is classified and routed to the correct in-app render
 * path. This locks the contract so a future change can't silently break one
 * source (e.g. send Drive through the canvas reader, which CORS-blocks it).
 */
import { describe, it, expect } from "vitest";
import {
  isGoogleDrive,
  isGoogleDocs,
  isNotion,
  isJsDelivrCdn,
  isGithubStoragesCdn,
  isNaveenBharatStorage,
  renderablePdfUrl,
  resolveEmbedUrl,
  extractDriveFileId,
} from "../lib/pdfViewerUrl";

const SOURCES = {
  jsdelivr: "https://cdn.jsdelivr.net/gh/org/repo@main/notes/day1.pdf",
  drive: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view",
  notion: "https://naveenbharat.notion.site/Class-Notes-abc123def4567890abc123def4567890",
  vercel: "https://storage-naveenbharat-recording.vercel.app/notes/chapter2.pdf",
  github: "https://github-storages-cdn.vercel.app/org/repo/main/notes/day3.pdf",
  signed: "https://example.supabase.co/storage/v1/object/sign/pdfs/x.pdf?token=eyJabc.def.ghi",
};

describe("PDF source routing", () => {
  it("classifies jsDelivr CDN and routes it through the proxy", () => {
    expect(isJsDelivrCdn(SOURCES.jsdelivr)).toBe(true);
    // jsDelivr must NOT be passed raw to pdf.js — it gets proxied.
    expect(renderablePdfUrl(SOURCES.jsdelivr)).not.toBe(SOURCES.jsdelivr);
  });

  it("classifies Google Drive and embeds the /preview iframe", () => {
    expect(isGoogleDrive(SOURCES.drive)).toBe(true);
    expect(extractDriveFileId(SOURCES.drive)).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(resolveEmbedUrl(SOURCES.drive).embedUrl).toContain("/preview");
    expect(resolveEmbedUrl(SOURCES.drive).isDrive).toBe(true);
  });

  it("classifies Notion pages (native renderer path)", () => {
    expect(isNotion(SOURCES.notion)).toBe(true);
    expect(isGoogleDocs(SOURCES.notion)).toBe(false);
  });

  it("classifies Vercel / NaveenBharat storage", () => {
    expect(isNaveenBharatStorage(SOURCES.vercel)).toBe(true);
  });

  it("classifies GitHub storage CDN", () => {
    expect(isGithubStoragesCdn(SOURCES.github)).toBe(true);
  });

  it("passes generic signed URLs straight to the canvas reader", () => {
    // Not a special host → renderablePdfUrl returns it unchanged for FastPdfReader.
    expect(isGoogleDrive(SOURCES.signed)).toBe(false);
    expect(isNotion(SOURCES.signed)).toBe(false);
    expect(isJsDelivrCdn(SOURCES.signed)).toBe(false);
    expect(renderablePdfUrl(SOURCES.signed)).toBe(SOURCES.signed);
  });

  it("encodes malformed URLs with spaces so they don't blank the reader", () => {
    const messy = "https://cdn.example.com/Day 2 _Re NEET (1).pdf";
    expect(renderablePdfUrl(messy)).not.toContain(" ");
  });
});
