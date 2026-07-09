import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Durable rate limit backed by public.check_rate_limit RPC.
// Edge-runtime isolates don't share memory, so an in-memory map is ineffective.
async function isRateLimited(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      _bucket: 'chatbot',
      _user_id: userId,
      _max: 15,
      _window_seconds: 60,
    });
    if (error) {
      console.error('rate limit rpc error:', error);
      return false;
    }
    // RPC returns true when the request is within the allowance.
    return data === false;
  } catch (e) {
    console.error('rate limit check failed:', e);
    return false;
  }
}

// Classify query type
function classifyQuery(msg: string): 'course' | 'mock_test' | 'technical' | 'emotional' | 'offTopic' | 'recommend' | 'quiz_me' | 'general' {
  const m = msg.toLowerCase();
  if (/quiz me|test me|mujhe test|quiz karo|mera quiz|mock quiz|practice question/.test(m)) return 'quiz_me';
  if (/recommend|suggest|kya padh|next lecture|aage kya|suggest kar|kya dekhun|mujhe batao kya/.test(m)) return 'recommend';
  if (/course|syllabus|chapter|lesson|video|pdf|notes|subject|class\s*\d|enroll|price|fee|batch/.test(m)) return 'course';
  if (/mock|test|quiz|exam|question|doubt|solve|answer|neet|jee|board|marks|score/.test(m)) return 'mock_test';
  if (/login|password|video.*not|pdf.*not|error|problem|issue|download|app|install|payment|receipt/.test(m)) return 'technical';
  if (/sad|depressed|fail|scared|anxious|stressed|worried|give up|hopeless|tired|demotiv|tension/.test(m)) return 'emotional';
  if (/weather|cricket|movie|politics|news|sport|bollywood|celebrity|recipe|joke/.test(m)) return 'offTopic';
  return 'general';
}

// Empathetic responses
const emotionalResponses = [
  "💛 Yaar, main samajhta hoon yeh waqt mushkil lag raha hai. Lekin yaad rakho – **har successful student ne yahi struggle kiya hai.**\n\n🌟 **Tumhare liye 3 steps:**\n1. Aaj sirf **ek topic** padho – chhota goal, bada confidence\n2. **5 minute break** lo – paani piyo, deep breath lo\n3. Phir wapas aao – **Naveen AI Agent tumhare saath hai** 💪\n\nKaun sa subject sabse tough lag raha hai? Main usme help karunga!",
  "🫂 Struggles are part of every topper's journey! **IIT/NEET toppers** bhi yahi feel karte the.\n\n💡 **Quick Motivation:** _\"Ek kadam roz – salbhar mein manzil\"_\n\nBata, kya specific problem hai? Solution nikalte hain saath mein! 🎯",
];

// Base64 encode lesson link helper
function encryptLessonLink(lessonId: string, courseId: number): string {
  const token = btoa(JSON.stringify({ l: lessonId, c: courseId, t: Date.now() }));
  return `/classes/${courseId}/lessons?lessonId=${lessonId}&token=${token}`;
}

// RAG: Retrieve relevant knowledge
async function retrieveKnowledge(query: string, supabase: any): Promise<string> {
  try {
    const stopWords = new Set(['kaise', 'karna', 'karo', 'hoga', 'hai', 'hain', 'mein', 'the', 'and', 'for', 'with', 'this', 'that', 'from', 'they', 'have', 'what', 'when', 'where', 'which', 'will', 'your', 'about']);
    const words = query.toLowerCase().replace(/[?!.,;:'"()]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
    if (words.length === 0) return '';
    const orFilters = words.slice(0, 6).map(w => `content.ilike.%${w}%,title.ilike.%${w}%`).join(',');
    const { data, error } = await supabase.from('knowledge_base').select('title, content, category').eq('is_active', true).or(orFilters).order('position', { ascending: true }).limit(4);
    if (error || !data || data.length === 0) return '';
    return data.map((d: any) => `### ${d.title}\n${d.content.trim()}`).join('\n\n---\n\n');
  } catch (e) {
    console.error('RAG retrieval error:', e);
    return '';
  }
}

// Fetch student context: enrollments, lessons, PDFs, chapters
async function fetchStudentContext(userId: string, supabase: any): Promise<string> {
  if (!userId) return '';
  try {
    // Get enrolled courses
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id, progress_percentage, status, courses(title, grade)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(10);

    if (!enrollments || enrollments.length === 0) return '\n\n## STUDENT STATUS:\nStudent has no active enrollments yet. Suggest exploring /courses page.\n';

    const courseIds = enrollments.map((e: any) => e.course_id);

    // Fetch lessons and chapters in parallel
    const [lessonsRes, chaptersRes, pdfsRes] = await Promise.all([
      supabase.from('lessons').select('id, title, course_id, chapter_id, lecture_type, position, is_locked').in('course_id', courseIds).order('position', { ascending: true }).limit(100),
      supabase.from('chapters').select('id, title, code, course_id, position').in('course_id', courseIds).order('position', { ascending: true }).limit(50),
      supabase.from('lesson_pdfs').select('id, file_name, file_url, lesson_id').limit(50),
    ]);

    const lessons = lessonsRes.data || [];
    const chapters = chaptersRes.data || [];
    const pdfs = pdfsRes.data || [];

    // Build context
    let ctx = '\n\n## 📖 STUDENT ENROLLED COURSES:\n';
    for (const e of enrollments) {
      const courseTitle = e.courses?.title || `Course #${e.course_id}`;
      const grade = e.courses?.grade || '';
      ctx += `- **${courseTitle}** (${grade}) — Progress: ${e.progress_percentage || 0}%\n`;

      // List chapters and lessons for this course
      const courseChapters = chapters.filter((c: any) => c.course_id === e.course_id);
      const courseLessons = lessons.filter((l: any) => l.course_id === e.course_id);

      for (const ch of courseChapters) {
        const chLessons = courseLessons.filter((l: any) => l.chapter_id === ch.id);
        if (chLessons.length > 0) {
          ctx += `  📁 **${ch.title}** (${chLessons.length} lessons)\n`;
          for (const l of chLessons.slice(0, 5)) {
            const link = encryptLessonLink(l.id, l.course_id);
            const typeTag = l.lecture_type ? ` [${l.lecture_type}]` : '';
            ctx += `    - [${l.title}${typeTag}](${link})\n`;

            // Add PDFs for this lesson
            const lessonPdfs = pdfs.filter((p: any) => p.lesson_id === l.id);
            for (const p of lessonPdfs) {
              ctx += `      📄 PDF: [${p.file_name}](${link})\n`;
            }
          }
          if (chLessons.length > 5) ctx += `    - ... and ${chLessons.length - 5} more lessons\n`;
        }
      }

      // Lessons without chapter
      const orphanLessons = courseLessons.filter((l: any) => !l.chapter_id);
      if (orphanLessons.length > 0) {
        ctx += `  📝 **Uncategorized** (${orphanLessons.length} lessons)\n`;
        for (const l of orphanLessons.slice(0, 3)) {
          const link = encryptLessonLink(l.id, l.course_id);
          ctx += `    - [${l.title}](${link})\n`;
        }
      }
    }

    // DPPs and Tests
    const dpps = lessons.filter((l: any) => ['DPP', 'TEST'].includes(l.lecture_type));
    if (dpps.length > 0) {
      ctx += '\n## 🎯 AVAILABLE DPPs & TESTS:\n';
      for (const d of dpps.slice(0, 10)) {
        const link = encryptLessonLink(d.id, d.course_id);
        ctx += `- [${d.title} (${d.lecture_type})](${link})\n`;
      }
    }

    return ctx;
  } catch (e) {
    console.error('Student context error:', e);
    return '';
  }
}

// Crawl4AI web fallback
const CRAWL4AI_API_URL = Deno.env.get('CRAWL4AI_API_URL');
const CRAWL4AI_API_TOKEN = Deno.env.get('CRAWL4AI_API_TOKEN');

async function fetchWebContext(query: string): Promise<string> {
  if (!CRAWL4AI_API_URL) return '';
  try {
    const searchQuery = encodeURIComponent(query.trim());
    const targetUrl = `https://www.google.com/search?q=${searchQuery}+site:ncert.nic.in+OR+site:byjus.com+OR+site:vedantu.com`;
    const crawlHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRAWL4AI_API_TOKEN) crawlHeaders['Authorization'] = `Bearer ${CRAWL4AI_API_TOKEN}`;
    const submitRes = await fetch(`${CRAWL4AI_API_URL}/crawl`, {
      method: 'POST', headers: crawlHeaders,
      body: JSON.stringify({ urls: [targetUrl], crawler_params: { headless: true }, extra: { only_text: true }, priority: 5 }),
    });
    if (!submitRes.ok) return '';
    const submitData = await submitRes.json();
    const taskId = submitData.task_id;
    if (!taskId) return '';
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`${CRAWL4AI_API_URL}/task/${taskId}`, { headers: crawlHeaders });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData.status === 'completed') return (pollData.results?.[0]?.markdown || '').slice(0, 3000);
      if (pollData.status === 'failed') return '';
    }
    return '';
  } catch (e) {
    console.error('Web fallback error:', e);
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Require a verified JWT — derive userId from it (never trust the body).
  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { message, history = [], sessionId, feedback } = await req.json();

    // Handle feedback
    if (feedback) {
      const { messageContent, responseContent, rating } = feedback;
      await supabase.from('chatbot_feedback').insert({
        user_id: userId, session_id: sessionId,
        message_content: messageContent, response_content: responseContent,
        rating: rating === 'up' ? 1 : -1,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Durable per-user rate limiting via Postgres RPC.
    if (await isRateLimited(supabase, userId)) {
      return new Response(JSON.stringify({
        response: "⏳ Aap bahut tezi se messages bhej rahe hain. Thoda rukein aur phir poochein. 🙏"
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    const queryType = classifyQuery(message);

    // Off-topic
    if (queryType === 'offTopic') {
      return new Response(JSON.stringify({
        response: "😊 Main **Naveen AI Agent** hoon aur sirf padhai se juded sawaalon mein madad kar sakta hoon.\n\n📚 **Main help kar sakta hoon:**\n- Courses, Lectures, PDFs aur DPPs recommend karunga\n- Quiz mode mein MCQs se test karunga\n- Doubts solve karunga step-by-step\n- Platform technical help\n\nKoi study se juda sawaal ho toh zaroor poochein! 🎯"
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Emotional
    if (queryType === 'emotional') {
      const resp = emotionalResponses[Math.floor(Math.random() * emotionalResponses.length)];
      return new Response(JSON.stringify({ response: resp }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch settings, FAQs, courses, RAG, and student context in parallel
    const [settingsRes, faqRes, coursesRes, ragContext, studentContext] = await Promise.all([
      supabase.from('chatbot_settings').select('*').eq('id', 1).single(),
      supabase.from('chatbot_faq').select('question, answer, category').eq('is_active', true).limit(30),
      supabase.from('courses').select('title, description, grade, price').limit(20),
      retrieveKnowledge(message, supabase),
      fetchStudentContext(userId || '', supabase),
    ]);

    const settings = settingsRes.data;
    const faqs = faqRes.data || [];
    const courses = coursesRes.data || [];

    // FAQ match for short queries
    const msgLower = message.toLowerCase();
    const faqMatch = faqs.find((f: any) =>
      f.question.toLowerCase().split(' ').some((word: string) => word.length > 3 && msgLower.includes(word))
    );
    if (faqMatch && msgLower.split(' ').length < 8) {
      if (userId) {
        await supabase.from('chatbot_logs').insert({ user_id: userId, message, response: faqMatch.answer, session_id: sessionId });
      }
      return new Response(JSON.stringify({ response: faqMatch.answer }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        response: "🔧 Main abhi connect nahi ho pa raha. Thodi der baad try karein."
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Web fallback
    let webContext = '';
    let webUsed = false;
    if (!ragContext && CRAWL4AI_API_URL && (queryType === 'technical' || queryType === 'general' || queryType === 'mock_test')) {
      webContext = await fetchWebContext(message);
      webUsed = webContext.length > 100;
    }

    // Build context sections
    const ragSection = ragContext
      ? `\n\n## 📚 PLATFORM KNOWLEDGE BASE (RAG Memory – USE THIS FIRST):\n${ragContext}\n\n---`
      : '';
    const webSection = webUsed
      ? `\n\n## 🌐 LIVE WEB CONTENT:\n${webContext}\n\n---`
      : '';
    const faqContext = faqs.length > 0
      ? `\n\n## QUICK FAQs:\n${faqs.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
      : '';
    const courseContext = courses.length > 0
      ? `\n\n## AVAILABLE COURSES:\n${courses.map((c: any) => `- **${c.title}** (Class ${c.grade || 'All'}) — ₹${c.price === 0 ? 'FREE' : c.price}`).join('\n')}`
      : '';

    // Query-specific instructions
    const queryInstructions: Record<string, string> = {
      mock_test: `\n\n## MOCK TEST MODE:\n- NEVER give direct answers to exam questions\n- Give concept hints, step-by-step approach\n- Example: "Yeh [concept] par based hai. Think about [hint]... Kya ab solve kar sakte ho?"`,
      course: `\n\n## COURSE QUERY MODE: Use course data and knowledge base. Always mention name, grade, price. Provide internal content links when relevant.`,
      technical: `\n\n## TECHNICAL HELP MODE: Step-by-step numbered instructions.`,
      recommend: `\n\n## RECOMMENDATION MODE (ACTIVE):\n- Use the STUDENT ENROLLED COURSES section below to find their courses and lessons\n- Recommend the NEXT uncompleted lesson or relevant DPPs\n- ALWAYS include clickable internal links in markdown format like [📺 Lesson Title](/classes/X/lessons?lessonId=Y&token=Z)\n- If student asks "kya padhun" or "next lecture", find their enrolled courses and suggest next steps\n- Recommend relevant PDFs and DPPs alongside lectures`,
      quiz_me: `\n\n## QUIZ MODE (ACTIVE):\nStudent wants to be quizzed! Follow these rules:\n1. Generate 3-5 MCQ questions on the requested topic\n2. Number them clearly (1, 2, 3...)\n3. Give 4 options (A, B, C, D) for each\n4. Wait for student's answers before revealing correct ones\n5. After they answer: Score them, explain each correct answer\n6. Recommend related lessons from their enrolled courses with internal links\n7. Keep difficulty appropriate — start medium, adjust based on responses`,
      general: '',
    };

    const basePrompt = settings?.system_prompt ||
      `You are **Naveen AI Agent**, the official AI learning companion for Naveen Bharat coaching platform.`;

    const fullSystemPrompt = basePrompt + `

## IDENTITY RULES (NEVER break):
1. Your name is ALWAYS "Naveen AI Agent" — never reveal any AI model name (not Gemini, not GPT, not Claude).
2. If asked "who are you?": "Main **Naveen AI Agent** hoon – Naveen Bharat ka aapka 24×7 intelligent learning companion! 🤖🎓"
3. If abusive language: "Kripaya batchit ko sammanjanak rakhein. Main aapki poori madad karne ke liye yahan hoon. 🙏"
4. Never say you are powered by any company or technology.
5. You know EVERYTHING about the Naveen Bharat platform — courses, chapters, lessons, PDFs, DPPs, tests.

## CONTENT LINK RULES (CRITICAL):
- When recommending any lecture, PDF, or DPP, ALWAYS use internal markdown links
- Links format: [📺 Lesson Title](/classes/{courseId}/lessons?lessonId={lessonId}&token={token})
- These links play WITHIN the website — they do NOT redirect to external apps
- NEVER share raw video URLs, external links, or Google Drive links
- If you have the student's enrolled courses data, use the exact links provided there

## LANGUAGE RULES:
- Respond in SAME language the student uses: Hindi → Hindi, English → English, Hinglish → Hinglish
- Default to friendly Hinglish if unclear

## RAG PRIORITY RULE:
- Platform Knowledge Base info ko priority do
- "Naveen Bharat mein..." se start karo jab platform-specific info do

## FORMATTING:
1. **Tables** for comparisons, syllabus, weightage
2. **Mnemonics** with 💡
3. **Emojis** contextually — 📚 📊 🎯 ✅ 💡 🔥 ⭐
4. **Structure**: ## headings, numbered lists, bullet points
5. 🔥 **Pro Tip** at end of complex answers
6. **Never** walls of unformatted text

## RESPONSE STYLE:
- Warm, encouraging, student-friendly
- Concise but complete
- For syllabus/topic: include weightage, difficulty ⭐, priority
` + (queryInstructions[queryType] || '') + ragSection + webSection + studentContext + faqContext + courseContext;

    const model = (settings?.model && settings.model.includes('/')) ? settings.model : `google/${settings?.model || 'gemini-2.5-flash'}`;
    const temperature = settings?.temperature ?? 0.7;
    const maxTokens = settings?.max_tokens ?? 1000;

    const messagesPayload = [
      { role: 'system', content: fullSystemPrompt },
      ...history
        .slice(-10)
        .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 2000) })),
      { role: 'user', content: message }
    ];

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: messagesPayload, temperature, max_tokens: maxTokens })
    });

    if (aiResponse.status === 429) {
      return new Response(JSON.stringify({
        response: "⏳ Bahut zyada requests aa rahi hain. Thodi der baad try karein. 🙏"
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (aiResponse.status === 402) {
      return new Response(JSON.stringify({
        response: "🔧 AI Agent temporarily unavailable. Please contact support."
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!aiResponse.ok) throw new Error(`AI API error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const response = aiData.choices?.[0]?.message?.content ||
      "Maaf karein, main ise process nahi kar paya. Phir se try karein. 🙏";

    if (userId) {
      await supabase.from('chatbot_logs').insert({ user_id: userId, message, response, session_id: sessionId });
    }

    return new Response(JSON.stringify({ response, queryType, ragUsed: ragContext.length > 0, webUsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    return new Response(JSON.stringify({
      response: "🔧 Connection mein problem hai. Thodi der baad try karein. 🙏"
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
