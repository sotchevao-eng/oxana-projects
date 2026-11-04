import type { Context, Next } from 'hono'
import {
  createConfiguredTokenVerifier,
  type TokenVerifier,
} from './tokenVerifier.js'
import { parseAllowlist } from './validation.js'

type OxanaAuthVariables = {
  userId: string
}

export function readOxanaAllowlist(): string[] {
  return parseAllowlist(process.env.OXANA_ALLOWED_USER_IDS)
}

export function isOxanaAllowlisted(userId: string): boolean {
  const allowlist = readOxanaAllowlist()
  return allowlist.includes(userId.trim().toLowerCase())
}

export function createRequireOxanaOwner(verifier: TokenVerifier) {
  return async function requireOxanaOwner(
    c: Context<{ Variables: OxanaAuthVariables }>,
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

    const allowlist = readOxanaAllowlist()
    if (allowlist.length === 0) {
      return c.json({ ok: false, error: 'oxana_allowlist_missing' }, 503)
    }

    const userId = await verifier.verifyAccessToken(token)
    if (!userId) {
      return c.json({ ok: false, error: 'unauthorized' }, 401)
    }

    if (!allowlist.includes(userId.toLowerCase())) {
      return c.json({ ok: false, error: 'oxana_forbidden' }, 403)
    }

    c.set('userId', userId)
    await next()
  }
}

export const requireOxanaOwner = createRequireOxanaOwner(
  createConfiguredTokenVerifier(),
)
