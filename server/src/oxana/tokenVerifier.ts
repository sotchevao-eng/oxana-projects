import { createRemoteJWKSet, jwtVerify } from 'jose'
import { verifySupabaseAccessToken } from '../middleware/auth.js'

/**
 * Provider-agnostic identity check for OXANA routes.
 * Task/chat handlers depend only on userId, not on Supabase.
 * Future Russian auth: implement TokenVerifier and set OXANA_AUTH_PROVIDER=russian.
 */
export interface TokenVerifier {
  readonly provider: string
  verifyAccessToken(token: string): Promise<string | null>
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getOxanaJwks() {
  if (jwks) return jwks
  const url = process.env.SUPABASE_URL?.trim()
  if (!url) {
    throw new Error('SUPABASE_URL is not configured')
  }
  jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`))
  return jwks
}

async function verifySupabaseJwtWithJwks(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getOxanaJwks(), {
      algorithms: ['ES256', 'RS256'],
    })
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

/**
 * Live Supabase sessions are ES256 (JWKS). HS256 via JWT secret still works
 * for local tests. PII middleware is unchanged.
 */
export async function verifyOxanaSupabaseAccessToken(
  token: string,
): Promise<string | null> {
  const fromHs256 = await verifySupabaseAccessToken(token)
  if (fromHs256) {
    return fromHs256
  }
  return verifySupabaseJwtWithJwks(token)
}

export function createSupabaseTokenVerifier(): TokenVerifier {
  return {
    provider: 'supabase',
    verifyAccessToken: verifyOxanaSupabaseAccessToken,
  }
}

export function createConfiguredTokenVerifier(): TokenVerifier {
  const provider = (process.env.OXANA_AUTH_PROVIDER ?? 'supabase')
    .trim()
    .toLowerCase()

  if (provider === 'russian') {
    throw new Error('OXANA_AUTH_PROVIDER=russian is reserved and not wired yet')
  }

  return createSupabaseTokenVerifier()
}
