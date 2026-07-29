import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isRateLimited, rateLimitedResponse } from "../_shared/rateLimit.ts";


Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Anon client to verify the user's JWT
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
  const userId = claimsData?.claims?.sub as string | undefined;
  if (authError || !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service role client for privileged operations (bypass RLS)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { action, session_token, session_id, device_type, user_agent } = body;

  // ── CREATE ──────────────────────────────────────────────────────────────────
  if (action === "create") {
    // 1. Count current active sessions
    const { data: activeSessions, error: listError } = await admin
      .from("user_sessions")
      .select("id, session_token, logged_in_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("logged_in_at", { ascending: true }); // oldest first

    if (listError) {
      console.error("list sessions error:", listError);
    }

    const sessions = activeSessions ?? [];

    // 2. If >= 2 active sessions → evict the oldest
    if (sessions.length >= 2) {
      const oldest = sessions[0];

      // Mark as inactive
      await admin
        .from("user_sessions")
        .update({ is_active: false, expires_at: new Date().toISOString() })
        .eq("id", oldest.id);

      // Broadcast force_logout to the evicted device via Realtime
      try {
        await admin
          .channel(`session:${userId}`)
          .send({
            type: "broadcast",
            event: "force_logout",
            payload: { sessionToken: oldest.session_token, userId },
          });
      } catch (e) {
        console.warn("broadcast error (non-fatal):", e);
      }
    }

    // 3. Insert new session
    const newToken = crypto.randomUUID();
    const { data: newSession, error: insertError } = await admin
      .from("user_sessions")
      .insert({
        user_id: userId,
        session_token: newToken,
        device_type: device_type ?? "web",
        user_agent: user_agent ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("insert session error:", insertError);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ session_token: newToken, session_id: newSession.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── HEARTBEAT ───────────────────────────────────────────────────────────────
  if (action === "heartbeat") {
    if (!session_token) {
      return new Response(JSON.stringify({ error: "session_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent DB write floods from a runaway heartbeat loop: 60 writes/min/user.
    if (await isRateLimited({ bucket: "session-heartbeat", userId, max: 60, windowSeconds: 60 })) {
      return rateLimitedResponse(corsHeaders, 30);
    }


    const { error } = await admin
      .from("user_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("session_token", session_token)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("heartbeat error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── TERMINATE ───────────────────────────────────────────────────────────────
  if (action === "terminate") {
    // Admin can terminate any session; regular user can only terminate their own
    const { data: isAdminResult } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    // Resolve target token — accept either session_token (self/admin) or
    // session_id (admin-only, from the sessions table row).
    let tokenToTerminate: string | undefined = session_token;
    if (!tokenToTerminate && session_id) {
      if (!isAdminResult) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row } = await admin
        .from("user_sessions")
        .select("session_token")
        .eq("id", session_id)
        .single();
      tokenToTerminate = row?.session_token;
    }

    if (!tokenToTerminate) {
      return new Response(JSON.stringify({ error: "session_token or session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = admin
      .from("user_sessions")
      .update({ is_active: false, expires_at: new Date().toISOString() })
      .eq("session_token", tokenToTerminate);

    // If not admin, restrict to own sessions. NOTE: PostgrestFilterBuilder is
    // immutable — .eq() returns a new builder, so we must reassign, otherwise
    // the ownership filter is silently dropped and any authenticated user who
    // guesses a session_token can terminate arbitrary sessions.
    if (!isAdminResult) {
      query = query.eq("user_id", userId);
    }


    const { error } = await query;
    if (error) {
      console.error("terminate session error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Broadcast force_logout so the evicted device logs out immediately
    try {
      const { data: sessionData } = await admin
        .from("user_sessions")
        .select("user_id")
        .eq("session_token", tokenToTerminate)
        .single();

      const targetUserId = sessionData?.user_id ?? userId;
      await admin
        .channel(`session:${targetUserId}`)
        .send({
          type: "broadcast",
          event: "force_logout",
          payload: { sessionToken: tokenToTerminate, userId: targetUserId },
        });
    } catch (e) {
      console.warn("broadcast error (non-fatal):", e);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── VALIDATE ─────────────────────────────────────────────────────────────────
  if (action === "validate") {
    if (!session_token) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data } = await admin
      .from("user_sessions")
      .select("is_active, expires_at")
      .eq("session_token", session_token)
      .eq("user_id", userId)
      .single();

    const isValid = !!(data?.is_active && new Date(data.expires_at) > new Date());

    return new Response(JSON.stringify({ valid: isValid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
