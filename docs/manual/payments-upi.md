# Payments & UPI (Razorpay)

## Flow

```text
Client → create-razorpay-order (edge fn, service role)
       → Razorpay Checkout (UPI intent / card / netbanking)
Razorpay → webhook → HMAC verify → enrollment INSERT
```

Enrollment **webhook-first** hai. Client ka "payment success" callback kabhi bhi
access grant karne ke liye akela source nahi hona chahiye.

## Test mode

1. Razorpay dashboard → Test Mode → API keys generate.
2. `RAZORPAY_KEY_ID` (rzp_test_…) aur `RAZORPAY_KEY_SECRET` Supabase edge
   function secrets me daalein. **Kabhi repo me commit na karein.**
3. Test UPI success VPA: `success@razorpay`, failure: `failure@razorpay`.

## UPI intent apps (Android)

Capacitor WebView me Razorpay checkout UPI intent (PhonePe / GPay / Paytm)
tabhi khulta hai jab:

- `AndroidManifest.xml` me `<queries>` block ho UPI package names ke saath, aur
- WebView external intent URLs (`upi://`, `phonepe://`, `tez://`, `paytmmp://`)
  ko system ko hand off kare.

Checklist:
- [ ] `com.phonepe.app`, `com.google.android.apps.nbu.paisa.user`, `net.one97.paytm` queries me
- [ ] Test payment real device par (emulator me UPI app nahi hoti)
- [ ] Webhook signature verify + replay guard (`webhook_events` table)

## Debug

- Payment ban jaye par enrollment na mile → `webhook_events` + `payment_events`
  rows dekhein; signature mismatch sabse common wajah hai (raw body ki jagah
  parsed JSON par HMAC).
- 401 from Razorpay → key rotate ho chuki hai, dono secrets dobara set karein.
