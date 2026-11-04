import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import { encryptPii } from '../crypto/piiCrypto.js'
import { getPiiPool } from '../db.js'
import { getSupabaseAdmin } from '../supabase.js'
import { clampText, parsePiiBody } from '../validation.js'

const rateBucket = new Map<string, { count: number; resetAt: number }>()

function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now()
  const current = rateBucket.get(key)
  if (!current || current.resetAt < now) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) {
    return false
  }
  current.count += 1
  return true
}

type BriefFieldRow = {
  field_key: string
  is_personal_data: boolean | null
  field_type: string | null
}

/**
 * Public brief PII intake:
 * - validates brief_token via Supabase (service role, server-only)
 * - encrypts PII into Russian Postgres
 * - optionally stores personal brief answers by field_key
 * - never echoes PII back
 */
export async function savePublicBriefPii(c: Context) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`brief-pii:${ip}`)) {
    return c.json({ ok: false, error: 'rate_limited' }, 429)
  }

  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ ok: false, error: 'validation_failed' }, 400)
  }

  const briefToken = clampText(body.briefToken ?? body.brief_token, 128)
  if (briefToken.length < 16) {
    return c.json({ ok: false, error: 'invalid_token' }, 400)
  }

  const parsed = parsePiiBody(body)
  if (!parsed.ok) {
    return c.json({ ok: false, error: parsed.error }, 400)
  }
  if (!parsed.data.consentGiven) {
    return c.json({ ok: false, error: 'consent_required' }, 400)
  }

  const supabase = getSupabaseAdmin()
  const { data: project, error: projectError } = await supabase
    .from('client_projects')
    .select('id, client_id, clients(id, pii_ref)')
    .eq('brief_token', briefToken)
    .maybeSingle()

  if (projectError || !project) {
    return c.json({ ok: false, error: 'invalid_token' }, 404)
  }

  const clientsRaw = (project as { clients?: unknown }).clients
  const clientRow = Array.isArray(clientsRaw) ? clientsRaw[0] : clientsRaw
  const clientId =
    clientRow && typeof clientRow === 'object'
      ? String((clientRow as { id?: string }).id ?? '')
      : String((project as { client_id?: string }).client_id ?? '')
  let piiRef =
    clientRow && typeof clientRow === 'object'
      ? String((clientRow as { pii_ref?: string | null }).pii_ref ?? '')
      : ''

  if (!clientId) {
    return c.json({ ok: false, error: 'invalid_token' }, 404)
  }

  const pool = getPiiPool()
  const consentAt = new Date().toISOString()

  try {
    if (!piiRef) {
      piiRef = randomUUID()
      await pool.query(
        `insert into public.client_pii (
           client_ref, full_name_enc, phone_enc, email_enc, messenger_enc,
           company_contact_enc, consent_given, consent_version, consent_at
         ) values ($1,$2,$3,$4,$5,$6,true,$7,$8)`,
        [
          piiRef,
          encryptPii(parsed.data.fullName),
          encryptPii(parsed.data.phone),
          encryptPii(parsed.data.email),
          encryptPii(parsed.data.messenger),
          encryptPii(parsed.data.companyContact),
          parsed.data.consentVersion,
          consentAt,
        ],
      )

      const { error: linkError } = await supabase
        .from('clients')
        .update({ pii_ref: piiRef })
        .eq('id', clientId)

      if (linkError) {
        console.info(
          JSON.stringify({
            event: 'brief_pii_link_failed',
            code: 'supabase_update_failed',
          }),
        )
        return c.json({ ok: false, error: 'server_error' }, 500)
      }
    } else {
      await pool.query(
        `update public.client_pii set
           full_name_enc = coalesce($2, full_name_enc),
           phone_enc = coalesce($3, phone_enc),
           email_enc = coalesce($4, email_enc),
           messenger_enc = coalesce($5, messenger_enc),
           company_contact_enc = coalesce($6, company_contact_enc),
           consent_given = true,
           consent_version = $7,
           consent_at = coalesce(consent_at, $8::timestamptz),
           updated_at = now()
         where client_ref = $1`,
        [
          piiRef,
          encryptPii(parsed.data.fullName),
          encryptPii(parsed.data.phone),
          encryptPii(parsed.data.email),
          encryptPii(parsed.data.messenger),
          encryptPii(parsed.data.companyContact),
          parsed.data.consentVersion,
          consentAt,
        ],
      )
    }

    const personalAnswers =
      body.personalAnswers && typeof body.personalAnswers === 'object'
        ? (body.personalAnswers as Record<string, unknown>)
        : {}

    const { data: fields } = await supabase
      .from('brief_fields')
      .select('field_key, is_personal_data, field_type')
      .eq('project_id', project.id)

    const allowedKeys = new Set(
      ((fields ?? []) as BriefFieldRow[])
        .filter(
          (field) =>
            field.is_personal_data ||
            field.field_type === 'email' ||
            field.field_type === 'phone',
        )
        .map((field) => field.field_key),
    )

    for (const [fieldKey, rawValue] of Object.entries(personalAnswers)) {
      if (!allowedKeys.has(fieldKey)) {
        continue
      }
      const text = clampText(rawValue, 2000)
      if (!text) continue
      await pool.query(
        `insert into public.brief_pii_answers (client_ref, project_ref, field_key, value_enc)
         values ($1,$2,$3,$4)
         on conflict (project_ref, field_key)
         do update set value_enc = excluded.value_enc, updated_at = now()`,
        [piiRef, project.id, fieldKey, encryptPii(text)],
      )
    }

    console.info(
      JSON.stringify({
        event: 'brief_pii_saved',
        project_id: project.id,
        has_ref: true,
      }),
    )

    return c.json({ ok: true })
  } catch {
    console.info(JSON.stringify({ event: 'brief_pii_failed', code: 'server_error' }))
    return c.json({ ok: false, error: 'server_error' }, 500)
  }
}
