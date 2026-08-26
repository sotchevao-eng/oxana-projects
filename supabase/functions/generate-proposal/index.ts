// Supabase Edge Function: generate-proposal
// Auth: requires Bearer JWT of authenticated admin.
// Writes NOTHING to proposals — returns preview JSON only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const ALLOWED_SECTION_TYPES = new Set([
  'client',
  'task',
  'solution',
  'scope',
  'stages',
  'deadline',
  'price',
  'options',
  'conditions',
  'cta',
])

const STYLE_HINTS: Record<string, string> = {
  short: 'Keep the proposal concise: short paragraphs, fewer sections if needed, no fluff.',
  standard: 'Use a balanced commercial proposal: clear structure, moderate detail.',
  detailed:
    'Write a more detailed proposal with fuller explanations, still without inventing facts.',
}

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
function appError(
  code: string,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse({ ok: false, error: code, ...extra }, 200)
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value).trim()
}

function validateAndNormalize(
  payload: Record<string, unknown>,
  adminPrice: string,
  adminDeadline: string,
) {
  const sectionsIn = Array.isArray(payload.sections) ? payload.sections : []
  if (sectionsIn.length === 0) {
    throw new Error('empty_sections')
  }
  if (sectionsIn.length > 16) {
    throw new Error('too_many_sections')
  }

  const sections: Array<{
    section_type: string
    title: string
    content: string
  }> = []

  for (const raw of sectionsIn.slice(0, 16)) {
    const item = (raw ?? {}) as Record<string, unknown>
    let section_type = String(item.section_type ?? item.sectionType ?? '').trim()
    if (!ALLOWED_SECTION_TYPES.has(section_type)) {
      continue
    }

    const title = String(item.title ?? '').trim()
    let content = String(item.content ?? '').trim()
    if (!title && !content) {
      continue
    }

    if (section_type === 'price') {
      if (!adminPrice) {
        continue
      }
      content = adminPrice
    }
    if (section_type === 'deadline') {
      if (!adminDeadline) {
        continue
      }
      content = adminDeadline
    }

    sections.push({
      section_type,
      title: title || section_type,
      content,
    })
  }

  if (adminPrice && !sections.some((s) => s.section_type === 'price')) {
    sections.push({
      section_type: 'price',
      title: 'Стоимость',
      content: adminPrice,
    })
  }
  if (adminDeadline && !sections.some((s) => s.section_type === 'deadline')) {
    sections.push({
      section_type: 'deadline',
      title: 'Срок',
      content: adminDeadline,
    })
  }

  if (sections.length === 0) {
    throw new Error('empty_sections')
  }

  return {
    title: String(payload.title ?? 'Коммерческое предложение').trim() ||
      'Коммерческое предложение',
    subtitle: String(payload.subtitle ?? '').trim(),
    intro: String(payload.intro ?? '').trim(),
    sections,
  }
}

function extractOpenAiError(body: unknown): {
  type?: string
  code?: string
  message?: string
} {
  if (!body || typeof body !== 'object') {
    return {}
  }
  const root = body as Record<string, unknown>
  const err =
    root.error && typeof root.error === 'object'
      ? (root.error as Record<string, unknown>)
      : root
  return {
    type: typeof err.type === 'string' ? err.type : undefined,
    code: typeof err.code === 'string' ? err.code : undefined,
    message:
      typeof err.message === 'string'
        ? err.message.slice(0, 400)
        : undefined,
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
    const price = String(body.price ?? '').trim()
    const deadline = String(body.deadline ?? '').trim()
    const comment = String(body.comment ?? body.aiComment ?? '').trim()
    let proposalStyle = String(body.proposalStyle ?? 'standard').trim()
    if (!['short', 'standard', 'detailed'].includes(proposalStyle)) {
      proposalStyle = 'standard'
    }

    if (!projectId) {
      return appError('project_required')
    }

    const { data: project, error: projectError } = await userClient
      .from('client_projects')
      .select(
        'id, title, project_type, description, task, notes, clients(name, company)',
      )
      .eq('id', projectId)
      .maybeSingle()

    if (projectError || !project) {
      return appError('project_not_found')
    }

    const clientsRaw = (project as { clients?: unknown }).clients
    const clientRow = Array.isArray(clientsRaw) ? clientsRaw[0] : clientsRaw
    const clientName =
      clientRow && typeof clientRow === 'object'
        ? String((clientRow as { name?: string }).name ?? '').trim()
        : ''
    const clientCompany =
      clientRow && typeof clientRow === 'object'
        ? String((clientRow as { company?: string | null }).company ?? '').trim()
        : ''

    const { data: briefFields } = await userClient
      .from('brief_fields')
      .select('label, field_key, sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    const { data: submissions } = await userClient
      .from('brief_submissions')
      .select('id, status, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })

    const submissionRows = submissions ?? []
    const submission =
      submissionRows.find((row: { status: string }) => row.status === 'submitted') ??
      submissionRows[0] ??
      null

    let answersMap: Record<string, unknown> = {}
    if (submission?.id) {
      const { data: answers } = await userClient
        .from('brief_answers')
        .select('field_key, value')
        .eq('submission_id', submission.id)
      for (const row of answers ?? []) {
        answersMap[String(row.field_key)] = row.value
      }
    }

    const briefLines = (briefFields ?? []).map(
      (field: { label: string; field_key: string }) => {
        const answer = asText(answersMap[field.field_key])
        return `- ${field.label}: ${answer || '—'}`
      },
    )

    const system = `You are a senior commercial proposal writer for OXANA PROJECTS (digital products, websites, tech projects).
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "title": "Коммерческое предложение",
  "subtitle": "string",
  "intro": "string",
  "sections": [
    {
      "section_type": "task|solution|scope|stages|deadline|price|options|conditions|cta|client",
      "title": "string",
      "content": "string"
    }
  ]
}
Tone:
- modern, clear, confident
- no bureaucratic language
- no aggressive sales
- no hype or empty pathos
- short paragraphs
- businesslike but alive Russian

Hard rules:
- Do NOT invent price, deadline, discounts, bonuses, guarantees, legal terms, testimonials, statistics, or features/stages not supported by the input.
- Do NOT invent functionality that is not implied by project/brief context.
- If price is missing: omit the price section entirely (do not invent an amount).
- If deadline is missing: omit the deadline section entirely (do not invent a timeline).
- Prefer section_types from: client, task, solution, scope, stages, deadline, price, options, conditions, cta.
- Include task, solution, scope, stages, cta when possible.
- Use Russian for all user-facing text.
- ${STYLE_HINTS[proposalStyle]}`

    const userPrompt = `Client:
- name: ${clientName || '—'}
- company: ${clientCompany || '—'}

Project:
- title: ${project.title}
- project_type: ${project.project_type}
- description: ${project.description || ''}
- task: ${project.task || ''}
- notes: ${project.notes || ''}

Brief Q&A:
${briefLines.length ? briefLines.join('\n') : '- (no brief answers yet)'}

Admin:
- price: ${price || '(not provided — do not invent)'}
- deadline: ${deadline || '(not provided — do not invent)'}
- comment: ${comment || '—'}
- proposal_style: ${proposalStyle}

Write a commercial proposal draft as JSON.`

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!aiRes.ok) {
      let parsed: unknown = null
      try {
        parsed = await aiRes.json()
      } catch {
        parsed = null
      }
      const openai = extractOpenAiError(parsed)
      return appError('ai_request_failed', {
        upstreamStatus: aiRes.status,
        openai,
      })
    }

    const aiJson = await aiRes.json()
    const content = aiJson?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return appError('ai_empty')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content) as Record<string, unknown>
    } catch {
      return appError('invalid_ai_response')
    }

    let draft
    try {
      draft = validateAndNormalize(parsed, price, deadline)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'validation_failed'
      return appError(
        message === 'empty_sections' || message === 'too_many_sections'
          ? message
          : 'validation_failed',
      )
    }

    // Preview only — never persist to proposals here.
    return jsonResponse({
      ok: true,
      draft,
      model,
      meta: {
        proposalStyle,
        hasPrice: Boolean(price),
        hasDeadline: Boolean(deadline),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (
      message === 'empty_sections' ||
      message === 'too_many_sections' ||
      message === 'validation_failed'
    ) {
      return appError(message)
    }
    return appError('unknown')
  }
})
