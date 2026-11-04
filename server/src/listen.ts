export function resolveListenPort(raw: string | undefined): number {
  const parsed = Number(raw)
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
    return parsed
  }
  return 8787
}

export function resolveListenHostname(raw: string | undefined): string {
  const hostname = String(raw ?? '').trim()
  return hostname || '0.0.0.0'
}

export function resolveListenOptions(env: NodeJS.ProcessEnv = process.env): {
  port: number
  hostname: string
} {
  return {
    port: resolveListenPort(env.PORT),
    hostname: resolveListenHostname(env.HOST),
  }
}
