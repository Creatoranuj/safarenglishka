import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { course_id } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Postgres-backed rate limit: 5 req / 60s per user, shared across
    // edge-runtime isolates. Without this an attacker could spam Razorpay
    // API lookups (cost + abuse vector).
    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'recover-enrollment',
      _user_id: user.id,
      _max: 5,
      _window_seconds: 60,
    });
    if (rlError) {
      console.error('Rate-limit check failed', { user_id: user.id, error: rlError.message });
    } else if (rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if already enrolled
    const { data: existingEnrollment } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', Number(course_id))
      .eq('status', 'active')
      .maybeSingle();

    if (existingEnrollment) {
      return new Response(JSON.stringify({
        success: true,
        enrollment_id: existingEnrollment.id,
        message: 'Already enrolled',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find completed payment record
    const { data: paymentRecord } = await supabaseAdmin
      .from('razorpay_payments')
      .select('id, razorpay_order_id, razorpay_payment_id, status, amount')
      .eq('user_id', user.id)
      .eq('course_id', Number(course_id))
      .eq('status', 'completed')
      .maybeSingle();

    if (!paymentRecord || !paymentRecord.razorpay_order_id) {
      return new Response(JSON.stringify({ error: 'No completed payment found for this course' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify with Razorpay API that payment is genuinely captured
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayRes = await fetch(
      `https://api.razorpay.com/v1/orders/${paymentRecord.razorpay_order_id}/payments`,
      {
        headers: { 'Authorization': `Basic ${credentials}` },
      }
    );

    if (!razorpayRes.ok) {
      console.error('Razorpay API error:', await razorpayRes.text());
      return new Response(JSON.stringify({ error: 'Failed to verify payment with Razorpay' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const razorpayData = await razorpayRes.json();
    const capturedPayment = razorpayData.items?.find(
      (p: any) => p.status === 'captured'
    );

    if (!capturedPayment) {
      return new Response(JSON.stringify({ error: 'Payment not captured on Razorpay. Contact support.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── AMOUNT TAMPERING CHECK ──
    const expectedAmountPaise = Math.round(paymentRecord.amount * 100);
    if (capturedPayment.amount !== expectedAmountPaise) {
      console.error(`RECOVERY AMOUNT MISMATCH! Expected: ${expectedAmountPaise}, Got: ${capturedPayment.amount}. User: ${user.id}, Order: ${paymentRecord.razorpay_order_id}`);
      return new Response(JSON.stringify({ error: 'Payment amount mismatch. Contact support.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Payment verified — create enrollment
    const { data: enrollment, error: enrollError } = await supabaseAdmin
      .from('enrollments')
      .upsert(
        {
          user_id: user.id,
          course_id: Number(course_id),
          status: 'active',
          purchased_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,course_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (enrollError) {
      console.error('Enrollment error:', enrollError);
      return new Response(JSON.stringify({ error: 'Payment verified but enrollment failed. Contact support.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Enrollment recovered for user:', user.id, 'course:', course_id);

    return new Response(JSON.stringify({
      success: true,
      enrollment_id: enrollment.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
