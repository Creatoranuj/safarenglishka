import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
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

  const { data: authData, error: authError } = await anonClient.auth.getUser();
  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = authData.user.id;

  // Service role client for privileged operations (bypass RLS)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { action, session_token, device_type, user_agent } = body;

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
      return new Response(JSON.stringify({ error: insertError.message }), {
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

    const { error } = await admin
      .from("user_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("session_token", session_token)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
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
    const tokenToTerminate = session_token;
    if (!tokenToTerminate) {
      return new Response(JSON.stringify({ error: "session_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin can terminate any session; regular user can only terminate their own
    const { data: isAdminResult } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    const query = admin
      .from("user_sessions")
      .update({ is_active: false, expires_at: new Date().toISOString() })
      .eq("session_token", tokenToTerminate);

    // If not admin, restrict to own sessions
    if (!isAdminResult) {
      query.eq("user_id", userId);
    }

    const { error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
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
