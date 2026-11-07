const SAFE_CODE_RE = /^(E[A-Z]+|[0-9A-Z]{5}|oxana_[a-z_]+|ai_[a-z_]+)$/

export function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined
  }
  const code = String((error as { code?: unknown }).code ?? '').trim()
  if (!code || !SAFE_CODE_RE.test(code)) {
    return undefined
  }
  return code
}

export function safeErrorName(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 80)
  }
  return 'Error'
}
