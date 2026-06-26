import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { type, record } = await req.json();

    if (!type || !record) {
      return new Response(JSON.stringify({ error: 'type and record required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let title = '';
    let content = '';
    let category = 'courses';
    let keywords: string[] = [];

    if (type === 'course') {
      title = `Course: ${record.title}`;
      content = `New course added: "${record.title}". ${record.description || ''} Grade: ${record.grade || 'N/A'}. Price: ₹${record.price || 0}.`;
      keywords = ['course', record.grade, record.title?.toLowerCase()].filter(Boolean);
    } else if (type === 'lesson') {
      title = `Lecture: ${record.title}`;
      content = `New lecture added: "${record.title}". ${record.description || ''} Category: ${record.category || 'general'}.`;
      keywords = ['lecture', 'lesson', record.category, record.title?.toLowerCase()].filter(Boolean);
    } else if (type === 'material') {
      title = `Study Material: ${record.title}`;
      content = `New study material uploaded: "${record.title}". Type: ${record.file_type}. ${record.description || ''}`;
      keywords = ['material', 'pdf', 'notes', record.file_type, record.title?.toLowerCase()].filter(Boolean);
    } else {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for duplicate (idempotent)
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('title', title)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, message: 'Already exists', id: existing[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        title,
        content,
        category,
        keywords,
        is_active: true,
        position: 999,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Insert error:', JSON.stringify(error));
      throw error;
    }

    console.log(`notify-ai: Added ${type} "${record.title}" to knowledge_base (id: ${data.id})`);

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('notify-ai error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
