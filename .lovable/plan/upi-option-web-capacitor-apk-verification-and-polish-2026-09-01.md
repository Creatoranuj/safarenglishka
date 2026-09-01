# UPI option — Web + Capacitor APK verification and polish

## Current state (verified in code)

Dono platforms par UPI pehle se wired hai:

- **Web** (`src/utils/razorpay.ts`): `UPI_FIRST_CHECKOUT_CONFIG` UPI ko `method.upi: true` ke saath sabse upar pin karta hai (`sequence: ['block.upi']`).
- **Native** (`src/utils/razorpayNative.ts`): web-only `config.display` payload strip hota hai (warna Android SDK card-only sheet dikhata hai) aur `method: { upi, card, netbanking, wallet }` bheja jata hai.
- **Platform split** sahi hai: `BuyCourse.tsx` aur `openSubscriptionCheckout.ts` dono `Capacitor.isNativePlatform()` par native SDK, warna web checkout.
- **AndroidManifest** me `<queries>` block complete hai — `upi:`, phonepe, gpay, tez, paytm schemes + GPay/PhonePe/Paytm/BHIM/Amazon/CRED/WhatsApp packages.
- `create-razorpay-order` order create karte waqt koi method restriction nahi lagata.

Matlab: koi structural UPI bug nahi hai. Jo gap bacha hai wo checkout quality + verification ka hai.

## Kya karna hai

### 1. Contact prefill (UPI ke liye sabse asardaar fix)
Abhi `prefill` me sirf `name` aur `email` jaata hai. Razorpay UPI collect flow bina mobile number ke ek extra step maangta hai. Profile ka `mobile` field prefill me add karna hai — `BuyCourse.tsx` aur `openSubscriptionCheckout.ts` dono me `contact` bhejenge (10-digit sanitize karke, khaali ho to field skip).

### 2. Native sheet me UPI ko top par rakhna
Native payload me `method` object ka key order UPI-first rakhna, aur explicitly `emi: false`, `paylater: false` set karna taaki sheet compact rahe aur UPI upar dikhe.

### 3. Web checkout par UPI intent hint
Web pe mobile browser me `UPI_FIRST_CHECKOUT_CONFIG` ke UPI block me `flows: ['intent', 'collect', 'qr']` add karna, taaki Android Chrome se seedha GPay/PhonePe app khule.

### 4. Diagnostics breadcrumb
`razorpayNative.ts` ke open breadcrumb me `methods_enabled` aur `platform` add karna, taaki agar future me APK me UPI na dikhe to Sentry se turant pata chale ki client ne kya bheja tha.

### 5. Verification
- `bun run build` + typecheck clean.
- Existing `src/test/formatRazorpayError.test.ts` aur payment tests pass.
- Web par preview me checkout modal khol kar confirm karna ki UPI block sabse upar aata hai.
- APK ke liye: manifest queries already sahi hain — aapko sirf naya APK build/install karke test karna hoga (sandbox se APK par test possible nahi).

## Technical notes

Files touched: `src/pages/BuyCourse.tsx`, `src/utils/openSubscriptionCheckout.ts`, `src/utils/razorpay.ts`, `src/utils/razorpayNative.ts`. Koi edge function, DB migration ya naya package nahi. Payment verification/webhook logic bilkul untouched — sirf checkout options.

Ek baat clear rahe: agar Razorpay Dashboard → Payment Methods me UPI live mode ke liye enabled hai (aapne bola hai enabled hai), to yeh changes usko web + APK dono me pehle option bana denge. Client-side config UPI ko enable nahi kar sakta, sirf display order aur prefill improve karta hai.
