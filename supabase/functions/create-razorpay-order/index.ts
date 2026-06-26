import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limiting: Postgres-backed via `public.check_rate_limit` so it works
// across Supabase edge-runtime isolates (in-memory Map didn't — each isolate
// saw its own counter, effectively giving 5×N reqs/min per user).
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5;

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

    // Service-role client (also used by the Postgres rate-limit check so
    // counters are shared across edge-runtime isolates).
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Postgres-backed rate limit (multi-isolate safe).
    const { data: rlAllowed, error: rlError } = await supabaseAdmin.rpc('check_rate_limit', {
      _bucket: 'create-razorpay-order',
      _user_id: user.id,
      _max: RATE_LIMIT_MAX,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rlError) {
      console.error('Rate-limit check failed', { user_id: user.id, error: rlError.message });
    } else if (rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { course_id } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch course price from DB (server-side — ignores client input)
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price')
      .eq('id', course_id)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: 'Course not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!course.price || course.price <= 0) {
      return new Response(JSON.stringify({ error: 'This course is free. Use free enrollment.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(JSON.stringify({ error: 'Razorpay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const amountInPaise = Math.round(course.price * 100);

    const credentials = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `course_${course_id}_user_${user.id.slice(0, 8)}`,
        notes: {
          course_id: course_id.toString(),
          user_id: user.id,
          course_title: course.title,
        }
      })
    });

    if (!razorpayResponse.ok) {
      const errText = await razorpayResponse.text();
      console.error('Razorpay API error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create Razorpay order' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const razorpayOrder = await razorpayResponse.json();

    // supabaseAdmin already created above for rate-limit check.

    // SEC: previously this insert was fire-and-forget. If it silently failed
    // (constraint violation, transient DB error) the user could still pay on
    // Razorpay and the webhook would then arrive with no DB row to validate
    // amount against. We now fail the order creation hard so the user never
    // pays for an order we can't reconcile.
    const { error: insertErr } = await supabaseAdmin.from('razorpay_payments').insert({
      user_id: user.id,
      course_id: course_id,
      razorpay_order_id: razorpayOrder.id,
      amount: course.price,
      currency: 'INR',
      status: 'pending',
    });
    if (insertErr) {
      console.error('Failed to record pending payment, aborting order:', insertErr);
      return new Response(JSON.stringify({ error: 'Could not initialise payment. Please retry.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      order_id: razorpayOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      key_id: RAZORPAY_KEY_ID,
      course_title: course.title,
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
