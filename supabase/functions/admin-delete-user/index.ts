// Admin-only account deletion.
// SECURITY: service role is used ONLY after the caller is verified as an admin.
// Self-delete and deleting the last remaining admin are both blocked server-side,
// so the UI guards cannot be bypassed by calling this function directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Authentication required' }, 401)
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser()
    if (authError || !callerUser) {
      return json({ success: false, error: 'Invalid token' }, 401)
    }

    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!callerRole) {
      return json({ success: false, error: 'Admin access required' }, 403)
    }

    let body: { userId?: string }
    try {
      body = await req.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON body' }, 400)
    }

    const userId = (body.userId || '').trim()
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRe.test(userId)) {
      return json({ success: false, error: 'A valid userId is required' }, 400)
    }

    if (userId === callerUser.id) {
      return json({ success: false, error: 'You cannot delete your own account' }, 400)
    }

    // Last-admin protection
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle()

    if (targetRole) {
      const { count } = await supabaseAdmin
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'admin')
      if ((count ?? 0) <= 1) {
        return json({ success: false, error: 'Cannot delete the last remaining admin' }, 400)
      }
    }

    // App-level cleanup first, then the auth identity.
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('deleteUser failed:', deleteError.message)
      return json({ success: false, error: 'Failed to delete account' }, 500)
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: callerUser.id,
      action: targetRole ? 'admin_delete_admin_account' : 'admin_delete_user',
      table_name: 'auth.users',
      record_count: 1,
    })

    return json({ success: true, deletedUserId: userId })
  } catch (error: unknown) {
    console.error('Error:', error)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
