// Supabase Edge Function: generate-brief
// Auth: requires Bearer JWT of authenticated admin.
// Writes NOTHING to brief_fields — returns preview JSON only.
// PD.2: OpenAI receives only whitelist-sanitized project context (no client PII).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { sanitizeProjectForAi } from '../_shared/piiSanitizer.ts'

const ALLOWED_TYPES = new Set([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'url',
  'single_select',
  'multi_select',
  'checkbox',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Application errors as HTTP 200 so supabase.functions.invoke returns `data`. */
function appError(code: string) {
  return jsonResponse({ ok: false, error: code }, 200)
}

function slugKey(raw: string): string {
  const mapped = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return mapped || 'field'
}

function validateAndNormalize(payload: Record<string, unknown>) {
  const fieldsIn = Array.isArray(payload.fields) ? payload.fields : []
  if (fieldsIn.length === 0) {
    throw new Error('empty_fields')
  }
  if (fieldsIn.length > 20) {
    throw new Error('too_many_fields')
  }

  const used = new Set<string>()
  const fields: Array<{
    label: string
    field_key: string
    field_type: string
    placeholder: string
    help_text: string
    required: boolean
    options: string[]
    is_personal_data: boolean
  }> = []

  for (const raw of fieldsIn.slice(0, 20)) {
    const item = (raw ?? {}) as Record<string, unknown>
    const label = String(item.label ?? '').trim()
    if (!label) continue

    let field_key = slugKey(String(item.field_key ?? label))
    const base = field_key
    let n = 2
    while (used.has(field_key)) {
      field_key = `${base}_${n++}`
    }
    used.add(field_key)

    let field_type = String(item.field_type ?? 'short_text')
    if (!ALLOWED_TYPES.has(field_type)) {
      field_type = 'short_text'
    }

    const options = Array.isArray(item.options)
      ? item.options.map((o) => String(o).trim()).filter(Boolean)
      : []

    if (
      (field_type === 'single_select' || field_type === 'multi_select') &&
      options.length === 0
    ) {
      field_type = 'long_text'
    }

    const is_personal_data =
      field_type === 'email' ||
      field_type === 'phone' ||
      Boolean(item.is_personal_data)

    fields.push({
      label,
      field_key,
      field_type,
      placeholder: String(item.placeholder ?? '').trim(),
      help_text: String(item.help_text ?? '').trim(),
      required: Boolean(item.required),
      options:
        field_type === 'single_select' || field_type === 'multi_select'
          ? options
          : [],
      is_personal_data,
    })
  }

  if (fields.length === 0) {
    throw new Error('empty_fields')
  }

  return {
    title: String(payload.title ?? '').trim(),
    intro: String(payload.intro ?? '').trim(),
    fields,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return appError('unauthorized')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini'

    if (!supabaseUrl || !anonKey) {
      return appError('server_misconfigured')
    }
    if (!openaiKey) {
      return appError('ai_not_configured')
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return appError('unauthorized')
    }

    const body = await req.json()
    const projectId = String(body.projectId ?? '').trim()
    if (!projectId) {
      return appError('project_required')
    }

    // Whitelist-only project fields — never select clients.* or notes.
    const { data: project, error: projectError } = await userClient
      .from('client_projects')
      .select('id, project_type, description, task')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError || !project) {
      return appError('project_not_found')
    }

    const safePayload = sanitizeProjectForAi({
      project_type: String(body.projectType ?? project.project_type ?? ''),
      description: String(body.description ?? project.description ?? ''),
      task: String(body.task ?? project.task ?? ''),
      admin_comment: String(body.aiComment ?? ''),
      questions_count: body.questionsCount,
    })

    const system = `You are a senior digital project strategist helping prepare a client brief questionnaire.
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "title": "string",
  "intro": "string",
  "fields": [
    {
      "label": "string",
      "field_key": "string",
      "field_type": "short_text|long_text|email|phone|number|date|url|single_select|multi_select|checkbox",
      "placeholder": "string",
      "help_text": "string",
      "required": true,
      "options": [],
      "is_personal_data": false
    }
  ]
}
Rules:
- Generate at most ${safePayload.questions_count} fields, never more than 20.
- field_key: lowercase latin letters, digits and underscore only; unique within fields.
- Questions must be relevant to the project type and context.
- Do not invent services, features or requirements that are not implied by the context.
- For email/phone contact questions set is_personal_data=true.
- Avoid unnecessary sensitive personal data beyond optional contact fields.
- Use Russian for label, placeholder and help_text.
- options must be non-empty only for single_select and multi_select.`

    const userPrompt = `Project type: ${safePayload.project_type}
Description: ${safePayload.description}
Task: ${safePayload.task}
Admin note for AI: ${safePayload.admin_comment}
Desired number of questions: ${safePayload.questions_count}

Create a practical brief for the client to fill in.`

    // Allowed diagnostics only — never log body/prompt/client.
    console.info(
      JSON.stringify({
        event: 'generate_brief_start',
        project_id: projectId,
        generation_type: 'brief',
        questions_count: safePayload.questions_count,
      }),
    )

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!aiRes.ok) {
      console.info(
        JSON.stringify({
          event: 'generate_brief_openai_error',
          project_id: projectId,
          upstreamStatus: aiRes.status,
        }),
      )
      return appError('ai_request_failed')
    }

    const aiJson = await aiRes.json()
    const content = aiJson?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return appError('ai_empty')
    }

    const parsed = JSON.parse(content) as Record<string, unknown>
    const draft = validateAndNormalize(parsed)

    console.info(
      JSON.stringify({
        event: 'generate_brief_ok',
        project_id: projectId,
        generation_type: 'brief',
        fields_count: draft.fields.length,
      }),
    )

    // Preview only — never persist to brief_fields here.
    return jsonResponse({ ok: true, draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    return appError(message)
  }
})
