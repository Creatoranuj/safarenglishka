# Autoscroll + My Library upgrade (source repo se)

Repo ab public hai aur clone ho gaya. Verify kiya: `navinbharat-b2433010` aapke hi codebase ka **newer version** hai (same stack, same deps — react 18.3, react-pdf 10.4, sonner, Capacitor 7.6). Isliye ye ek clean in-place upgrade hai, naya feature nahi.

## Abhi kya alag hai (live check)

| Area | Mera project | Source repo |
|---|---|---|
| `useAutoScroll.ts` | 237 lines | 817 lines |
| `AutoScrollFab.tsx` | 220 | 411 |
| `FastPdfReader.tsx` | 830 | 1602 |
| `DocReaderShell.tsx` | 413 | 857 |
| `MyLibrary.tsx` | 426 | 529 |
| IndexedDB version | 4 | 5 |

Mere project me **poori tarah missing**: `lib/reader/dwellEngine.ts`, `viewer/AutoScrollSheet.tsx`, `viewer/ChipGrid.tsx`, `viewer/autoScrollLimits.ts`, `viewer/ReaderOverlays.tsx`, `viewer/PageIndicatorPill.tsx`, `viewer/WindowAutoScrollFab.tsx`, `viewer/ReaderDebugPanel.tsx`, `lib/linkOfflineSave.ts`, `lib/fetchDocumentBlob.ts`, `lib/pdfCanvasBudget.ts`, `lib/reader/scrollHost.ts`, `hooks/useScrollHost.ts`, `library/personal/AddFromLinkDialog.tsx`, `library/reader/ReaderSearchBar.tsx`, `library/reader/ReaderZoomControls.tsx`, `library/reader/MarkdownPreview.tsx`, `library/reader/NoteToolbar.tsx`.

Already identical (chhoona nahi): `ReaderErrorBoundary`, `useReaderChrome`, `useOverlayBackClose`, `StorageManagerSheet`, `LazyPdfViewer`, `SmartNotesReader`, `libraryNotes`, `MarkdownViewer`.

## Kya karunga

1. **Autoscroll stack replace** — `useAutoScroll`, `dwellEngine`, poora `src/components/viewer/*` repo version se (dwellEngine ka page-boundary pause logic as-is).
2. **My Library data + logic replace** — `personalLibraryDB` (v4 → v5 upgrade path verify karunga taaki existing users ka data na toote), `personalLibraryQuota`, `services/personalLibrary`, `usePersonalLibrary` (refresh coalescing + `personalLibrary:refresh` replay), `detectFileType`, plus naye `linkOfflineSave`, `fetchDocumentBlob`, `pdfCanvasBudget` (20-page canvas release).
3. **My Library + reader UI replace** — `library/personal/**` (AddFromLinkDialog sameet), `DocReaderShell`, `UniversalFileViewer`, `library/reader/**` (search bar with 1/12 counter, zoom controls), `FastPdfReader`, `PdfViewer`, `PdfViewerWithAutoScroll`, `hooks/useScrollHost` + `lib/reader/scrollHost`.
4. **`public/pdfjs/**` full replace** — worker/cmaps/standard_fonts version match rahe.
5. **Mount points wire-up** — `Downloads.tsx`, `LessonView.tsx`, `Library.tsx`, `NotesPanel.tsx` me sirf itna adapt karunga ki naye components sahi mount hon. Ye pages mere project ke apne changes rakhte hain, isliye inhe blind overwrite **nahi** karunga — sirf reader/library ke touchpoints update honge.
6. **Duplicates delete** — koi purani parallel copy bachi to hatayi jayegi; ek hi MyLibrary, ek hi reader shell.
7. **Local work preserve** — recent lint fixes (FolderGrid hook order), Language/i18n context, haptics, design tokens intact rahenge. Source me FolderGrid ka hook-order fix pehle se maujood hai, to regression nahi hoga.

## Verification

- `tsgo` typecheck + `vite build` green, bundle budget ke andar
- `vitest` (autoScrollFab, pdfViewer-regression) pass
- 390px mobile Playwright pass: file add karte hi instant dikhe, reader me zoom pill, search counter, page chip, autoscroll FAB
- Aakhir me report: kya replace hua, kya naya aaya, kya delete hua

## Risk / faisla

`personalLibraryDB` v4 → v5: upgrade path ka code padh kar confirm karunga ki purane store safe migrate hote hain. Agar migration destructive nikla to rukunga aur aapse poochunga — pehle nahi badlunga.
