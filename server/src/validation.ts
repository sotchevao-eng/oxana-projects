const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+0-9()\-\s]{6,32}$/

export function clampText(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

export function validateEmail(value: string): boolean {
  if (!value) return true
  return value.length <= 254 && EMAIL_RE.test(value)
}

export function validatePhone(value: string): boolean {
  if (!value) return true
  return PHONE_RE.test(value)
}

export type PiiInput = {
  fullName: string
  phone: string
  email: string
  messenger: string
  companyContact: string
  consentGiven: boolean
  consentVersion: string
}

export function parsePiiBody(body: Record<string, unknown>): {
  ok: true
  data: PiiInput
} | { ok: false; error: string } {
  const fullName = clampText(body.fullName ?? body.full_name ?? body.name, 120)
  const phone = clampText(body.phone, 32)
  const email = clampText(body.email, 254)
  const messenger = clampText(body.messenger, 80)
  const companyContact = clampText(
    body.companyContact ?? body.company_contact,
    160,
  )
  const consentGiven = Boolean(body.consentGiven ?? body.consent_given)
  const consentVersion = clampText(
    body.consentVersion ?? body.consent_version ?? process.env.CONSENT_VERSION,
    64,
  )

  if (!fullName && !phone && !email && !messenger) {
    return { ok: false, error: 'validation_failed' }
  }
  if (!validateEmail(email) || !validatePhone(phone)) {
    return { ok: false, error: 'validation_failed' }
  }

  return {
    ok: true,
    data: {
      fullName,
      phone,
      email,
      messenger,
      companyContact,
      consentGiven,
      consentVersion: consentVersion || 'unknown',
    },
  }
}
