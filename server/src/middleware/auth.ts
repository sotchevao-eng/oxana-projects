import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type AuthVariables = {
  userId: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (jwks) return jwks
  const url = process.env.SUPABASE_URL?.trim()
  if (!url) {
    throw new Error('SUPABASE_URL is not configured')
  }
  jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`))
  return jwks
}

export async function verifySupabaseAccessToken(
  token: string,
): Promise<string | null> {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  try {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim()
    const payload = jwtSecret
      ? (
          await jwtVerify(trimmed, new TextEncoder().encode(jwtSecret), {
            algorithms: ['HS256'],
          })
        ).payload
      : (await jwtVerify(trimmed, getJwks(), { algorithms: ['ES256', 'RS256'] }))
          .payload

    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
) {
  const header = c.req.header('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }

  const token = header.slice(7).trim()
  if (!token) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }

  const sub = await verifySupabaseAccessToken(token)
  if (!sub) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  c.set('userId', sub)
  await next()
}
