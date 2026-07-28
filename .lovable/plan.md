## Problem

Payment ke baad `/my-courses` par course turant dikhe — abhi kabhi-kabhi khali dikhta hai.

Codebase scan se jo actually confirm hua:

- Paid enrollment ka core logic sahi hai — `complete_paid_enrollment` RPC `enrollments` me `status='active'` row insert/upsert karta hai (ON CONFLICT safe), aur `verify-razorpay-payment` + `razorpay-webhook` dono usi RPC ko call karte hain.
- `src/pages/MyCourses.tsx` enrollments ko **sirf mount par aur window `focus` par** fetch karta hai (`status='active'` filter ke sath). Koi retry, polling, ya realtime subscription nahi hai.
- `src/hooks/useEnrollmentRecovery.ts` global hai (`App.tsx:140`) lekin sirf auth-ready aur `app:resumed` par chalta hai — payment ke baad turant `/my-courses` par land karne par ye dobara nahi chalta.
- `BuyCourse.tsx` verify ke baad `navigate('/my-courses')` karta hai; agar verify 503 (`razorpay_unreachable`) tha aur enrollment webhook se 2–15s baad aayi, to My Courses pehle hi khali render ho chuka hota hai aur user ke paas refresh ke alawa kuch nahi.

Yani missing logic = **My Courses par arrival-time reconciliation + auto-refresh**, na ki enrollment write path.

## Kya banega

### 1. Arrival reconcile on My Courses
Mount par, agar user ke paas `nb:pendingOrder:<uid>:<courseId>` localStorage key hai (ye BuyCourse checkout se pehle likhta hai) ya route state me `justPurchased` flag hai:
- pehle normal fetch,
- agar us course ki enrollment nahi mili to `recover-enrollment` edge function call (existing, rate-limited, idempotent),
- success par key clear + refetch + success toast.

### 2. Short reconcile window (poll)
Jab `justPurchased`/pending key mojood ho aur expected course list me na ho: 3s interval par max ~5 baar refetch (total ~15s), phir ruk jaye. Normal visits par koi extra query nahi — bandwidth same rehta hai.

### 3. Realtime backstop
`enrollments` par user-scoped realtime subscription (`useEffect` + `supabase.removeChannel` cleanup, filter `user_id=eq.<uid>`) — webhook se row aate hi list khud update ho jaye. Agar table realtime publication me nahi hai to migration se add karenge (`ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollments`); RLS pehle se hai isliye user sirf apni rows dekhega.

### 4. Empty state me manual recovery CTA
"Recently paid but course not showing?" button → `recover-enrollment` chalayega, result ke hisab se toast: enroll ho gaya / "payment mila to enrollment webhook se automatically ho jayegi" wali friendly copy.

### 5. BuyCourse → MyCourses handoff
Redirect par `navigate('/my-courses', { state: { justPurchased: courseId } })` bhejenge taki My Courses ko pata ho kis course ka intezaar karna hai (pending key ke alawa dusra signal).

## Technical notes

- Files: `src/pages/MyCourses.tsx` (reconcile + poll + realtime + CTA), `src/pages/BuyCourse.tsx` (navigation state), `src/pages/PaymentCallback.tsx` (same state pass), possibly ek chhota hook `src/hooks/useEnrollmentArrival.ts` taki MyCourses bloat na ho.
- Koi naya table/column nahi. Sirf realtime publication ke liye ek migration lag sakti hai (pehle check karenge ki already added hai ya nahi).
- Poll aur realtime dono guarded — pending signal ke bina koi extra network activity nahi.
- Free enrollment path (`self-enroll-free`) already same list me aata hai; usme koi change nahi.
