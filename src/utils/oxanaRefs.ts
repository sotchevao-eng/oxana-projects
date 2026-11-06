export type OxanaEntityRef =
  | { kind: 'task'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'event'; id: string }

const REF_RE = /\[\[(task|project|event):([0-9a-f-]{36})\]\]/i

export function parseOxanaRef(body: string | null | undefined): OxanaEntityRef | null {
  const match = String(body ?? '').match(REF_RE)
  if (!match) return null
  return {
    kind: match[1].toLowerCase() as OxanaEntityRef['kind'],
    id: match[2],
  }
}

export function notificationTarget(item: {
  sourceType?: string | null
  sourceId?: string | null
  body?: string | null
}): OxanaEntityRef | null {
  if (item.sourceType && item.sourceId) {
    return {
      kind: item.sourceType as OxanaEntityRef['kind'],
      id: item.sourceId,
    }
  }
  return parseOxanaRef(item.body)
}

export function visibleNotificationBody(body: string | null | undefined): string {
  return String(body ?? '')
    .replace(REF_RE, '')
    .replace(/^\s+|\s+$/g, '')
}
