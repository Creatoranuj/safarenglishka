import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role using service role client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const { razorpay_payment_id, razorpay_order_id } = body;

    if (!razorpay_payment_id || !razorpay_order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'razorpay_payment_id and razorpay_order_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Razorpay Refund API
    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const refundResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ speed: 'normal' }),
      }
    );

    const refundData = await refundResponse.json();

    if (!refundResponse.ok) {
      console.error('Razorpay refund error:', refundData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: refundData.error?.description || 'Razorpay refund failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomic: flip razorpay_payments.status='refunded' AND enrollments.status='refunded'
    // in one transaction, so course access is revoked the moment the refund is initiated.
    const { error: rpcError } = await supabaseAdmin.rpc('process_refund', {
      _razorpay_order_id: razorpay_order_id,
    });

    if (rpcError) {
      console.error('process_refund RPC error:', rpcError);
      // Refund already succeeded on Razorpay — surface but don't fail the response
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Refund succeeded on Razorpay but DB update failed. Reconcile manually.',
          refund_id: refundData.id,
          refund_status: refundData.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Refund initiated successfully',
        refund_id: refundData.id,
        refund_status: refundData.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Refund error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
