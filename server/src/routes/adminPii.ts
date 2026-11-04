import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import { encryptPii, decryptPii } from '../crypto/piiCrypto.js'
import { getPiiPool } from '../db.js'
import { parsePiiBody } from '../validation.js'

type ClientPiiRow = {
  id: string
  client_ref: string
  full_name_enc: string | null
  phone_enc: string | null
  email_enc: string | null
  messenger_enc: string | null
  company_contact_enc: string | null
  consent_given: boolean
  consent_version: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
}

function mapDecrypted(row: ClientPiiRow) {
  return {
    ref: row.client_ref,
    fullName: decryptPii(row.full_name_enc),
    phone: decryptPii(row.phone_enc),
    email: decryptPii(row.email_enc),
    messenger: decryptPii(row.messenger_enc),
    companyContact: decryptPii(row.company_contact_enc),
    consentGiven: row.consent_given,
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createPii(c: Context) {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ ok: false, error: 'validation_failed' }, 400)
  }

  const parsed = parsePiiBody(body)
  if (!parsed.ok) {
    return c.json({ ok: false, error: parsed.error }, 400)
  }

  if (!parsed.data.consentGiven) {
    return c.json({ ok: false, error: 'consent_required' }, 400)
  }

  const clientRef =
    typeof body.clientRef === 'string' && body.clientRef.trim()
      ? body.clientRef.trim()
      : randomUUID()

  const pool = getPiiPool()
  const consentAt = new Date().toISOString()

  try {
    const { rows } = await pool.query<ClientPiiRow>(
      `insert into public.client_pii (
         client_ref,
         full_name_enc,
         phone_enc,
         email_enc,
         messenger_enc,
         company_contact_enc,
         consent_given,
         consent_version,
         consent_at
       ) values ($1,$2,$3,$4,$5,$6,true,$7,$8)
       returning *`,
      [
        clientRef,
        encryptPii(parsed.data.fullName),
        encryptPii(parsed.data.phone),
        encryptPii(parsed.data.email),
        encryptPii(parsed.data.messenger),
        encryptPii(parsed.data.companyContact),
        parsed.data.consentVersion,
        consentAt,
      ],
    )

    return c.json({
      ok: true,
      ref: rows[0].client_ref,
    })
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : ''
    if (code === '23505') {
      return c.json({ ok: false, error: 'ref_exists' }, 409)
    }
    console.info(JSON.stringify({ event: 'pii_create_failed', code: 'db_error' }))
    return c.json({ ok: false, error: 'server_error' }, 500)
  }
}

export async function getPii(c: Context) {
  const ref = c.req.param('ref')?.trim()
  if (!ref || ref.length < 16) {
    return c.json({ ok: false, error: 'not_found' }, 404)
  }

  const pool = getPiiPool()
  const { rows } = await pool.query<ClientPiiRow>(
    `select * from public.client_pii where client_ref = $1 limit 1`,
    [ref],
  )

  if (!rows[0]) {
    return c.json({ ok: false, error: 'not_found' }, 404)
  }

  try {
    return c.json({ ok: true, data: mapDecrypted(rows[0]) })
  } catch {
    console.info(JSON.stringify({ event: 'pii_decrypt_failed', code: 'crypto_error' }))
    return c.json({ ok: false, error: 'server_error' }, 500)
  }
}

export async function patchPii(c: Context) {
  const ref = c.req.param('ref')?.trim()
  if (!ref || ref.length < 16) {
    return c.json({ ok: false, error: 'not_found' }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ ok: false, error: 'validation_failed' }, 400)
  }

  const parsed = parsePiiBody(body)
  if (!parsed.ok) {
    return c.json({ ok: false, error: parsed.error }, 400)
  }

  const pool = getPiiPool()
  const consentAt = parsed.data.consentGiven ? new Date().toISOString() : null

  const { rows } = await pool.query<ClientPiiRow>(
    `update public.client_pii set
       full_name_enc = $2,
       phone_enc = $3,
       email_enc = $4,
       messenger_enc = $5,
       company_contact_enc = $6,
       consent_given = $7,
       consent_version = $8,
       consent_at = case when $7 then coalesce($9::timestamptz, consent_at, now()) else consent_at end,
       updated_at = now()
     where client_ref = $1
     returning *`,
    [
      ref,
      encryptPii(parsed.data.fullName),
      encryptPii(parsed.data.phone),
      encryptPii(parsed.data.email),
      encryptPii(parsed.data.messenger),
      encryptPii(parsed.data.companyContact),
      parsed.data.consentGiven,
      parsed.data.consentVersion,
      consentAt,
    ],
  )

  if (!rows[0]) {
    return c.json({ ok: false, error: 'not_found' }, 404)
  }

  return c.json({ ok: true, ref })
}
