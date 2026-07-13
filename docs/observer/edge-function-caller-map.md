# Edge Function Caller Map

_Generated: 2026-07-13 — `scripts/audit-edge-function-callers.mjs`_

Total functions: **38** — called from UI: **29**, backend-only (expected): **5**, orphaned: **4**

## Orphaned — needs UI or removal (4)

- `get-video-stream`
- `notify-ai`
- `send-phone-otp`
- `verify-phone-otp`

## Called from UI (29)

- `bunny-cdn` — `src/lib/bunnyCdn.ts`
- `chatbot` — `src/App.tsx`, `src/components/Layout/Sidebar.tsx`, `src/components/chat/ChatWidget.tsx`
- `crawl4ai-bridge` — `src/pages/AdminChatbotSettings.tsx`
- `create-razorpay-order` — `src/pages/BuyCourse.tsx`
- `create-subscription-order` — `src/utils/openSubscriptionCheckout.ts`
- `create-zoom-meeting` — `src/pages/Doubts.tsx`
- `deep-search-lecture` — `src/components/video/VideoSummarizer.tsx`, `src/hooks/useLectureSearch.ts`
- `dependency-scan` — `src/pages/AdminSecurity.tsx`
- `firecrawl-scrape` — `src/pages/AdminChatbotSettings.tsx`
- `generate-embedding` — `src/pages/AdminChatbotSettings.tsx`
- `get-lesson-url` — `src/lib/lessonDownloads.ts`, `src/pages/LessonView.tsx`
- `get-zoom-signature` — `src/components/live/ZoomMeetingEmbed.tsx`
- `initiate-refund` — `src/pages/Admin.tsx`
- `manage-session` — `src/lib/native/sessionTracker.ts`, `src/pages/Admin.tsx`, `src/pages/Settings.tsx`
- `notion-page` — `src/components/video/NotionPageRenderer.tsx`
- `pdf-proxy` — `src/components/course/DocumentReader.tsx`, `src/components/video/PdfViewer.tsx`, `src/lib/pdfViewerUrl.ts`
- `platform-stats` — `src/hooks/usePlatformStats.ts`
- `razorpay-webhook` — `src/hooks/useEnrollmentRecovery.ts`
- `recover-enrollment` — `src/hooks/useEnrollmentRecovery.ts`, `src/pages/BuyCourse.tsx`
- `request-account-deletion` — `src/pages/DeleteAccountPublic.tsx`, `src/pages/Settings.tsx`
- `resolve-doubt` — `src/hooks/useLessonChat.ts`, `src/pages/Doubts.tsx`
- `resolve-storage-pdf` — `src/lib/native/naveenStoragePdf.ts`
- `score-quiz` — `src/pages/QuizAttempt.tsx`
- `self-enroll-free` — `src/hooks/useEnrollments.ts`
- `start-subscription-trial` — `src/utils/openSubscriptionCheckout.ts`
- `summarize-video` — `src/components/lesson/TopicsCovered.tsx`, `src/components/video/VideoSummarizer.tsx`
- `validate-email` — `src/pages/Signup.tsx`
- `verify-razorpay-payment` — `src/pages/BuyCourse.tsx`, `src/pages/PaymentCallback.tsx`
- `verify-subscription-payment` — `src/utils/openSubscriptionCheckout.ts`

## Backend-only, expected (5)

- `content-redirect`
- `razorpay-refund-webhook`
- `security-regression`
- `seed-knowledge`
- `setup-admin`

_To add an expected backend-only function, extend `BACKEND_ONLY_ALLOWLIST` in the script._
