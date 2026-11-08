import type {
  OxanaChatProposal,
  OxanaChooseTaskProposal,
  OxanaTaskPriority,
  OxanaTaskProposal,
  OxanaTaskSnapshot,
  OxanaTaskStatus,
  OxanaUpdateField,
  OxanaUpdateTaskIntend,
  OxanaUpdateTaskProposal,
} from '../types/oxana'

export const OXANA_CHAT_SESSION_PREFIX = 'oxana.cabinet.chat.v1:'
export const OXANA_CHAT_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
const SESSION_VERSION = 1
const MAX_TURNS = 24
const MAX_TEXT = 4000
const MAX_JSON_CHARS = 80_000

const PRIORITIES: OxanaTaskPriority[] = ['low', 'normal', 'high', 'urgent']
const STATUSES: OxanaTaskStatus[] = ['open', 'in_progress', 'done', 'cancelled']
const UPDATE_FIELDS: OxanaUpdateField[] = [
  'title',
  'description',
  'dueAt',
  'priority',
  'status',
]
const SECRET_KEY =
  /token|password|secret|authorization|service_role|api[_-]?key|refresh/i
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type OxanaChatProposalStatus =
  | 'open'
  | 'submitting'
  | 'created'
  | 'updated'
  | 'cancelled'

export type OxanaChatTurn =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text: string
      proposal?: OxanaChatProposal
      proposalStatus?: OxanaChatProposalStatus
      proposalError?: string | null
      idempotencyKey?: string
    }

export interface OxanaChatSessionState {
  turns: OxanaChatTurn[]
  message: string
}

export interface OxanaChatSessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

function sessionStore(): OxanaChatSessionStorage | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null
    }
    return sessionStorage
  } catch {
    return null
  }
}

export function oxanaChatSessionKey(userId: string): string {
  return `${OXANA_CHAT_SESSION_PREFIX}${userId}`
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSecretKey)
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.entries(value).some(
    ([key, nested]) => SECRET_KEY.test(key) || containsSecretKey(nested),
  )
}

function clampText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, max)
}

function optionalText(value: unknown): string | null {
  if (value === null) {
    return null
  }
  const text = clampText(value)
  return text || null
}

function asPriority(value: unknown): OxanaTaskPriority | null {
  return typeof value === 'string' && PRIORITIES.includes(value as OxanaTaskPriority)
    ? (value as OxanaTaskPriority)
    : null
}

function asStatus(value: unknown): OxanaTaskStatus | null {
  return typeof value === 'string' && STATUSES.includes(value as OxanaTaskStatus)
    ? (value as OxanaTaskStatus)
    : null
}

function snapshot(raw: unknown): OxanaTaskSnapshot | null {
  if (!isRecord(raw)) {
    return null
  }
  const priority = asPriority(raw.priority)
  const status = asStatus(raw.status)
  const title = clampText(raw.title, 200)
  if (!priority || !status || !title) {
    return null
  }
  return {
    title,
    description: optionalText(raw.description),
    dueAt: optionalText(raw.dueAt),
    dueLabel: optionalText(raw.dueLabel),
    priority,
    status,
  }
}

function parseCreateProposal(raw: Record<string, unknown>): OxanaTaskProposal | null {
  const priority = asPriority(raw.priority)
  const title = clampText(raw.title, 200)
  if (!priority || !title) {
    return null
  }
  const projectId = clampText(raw.projectId, 36)
  return {
    type: 'create_task',
    title,
    description: optionalText(raw.description),
    dueAt: optionalText(raw.dueAt),
    dueLabel: optionalText(raw.dueLabel),
    priority,
    projectId: projectId && isUuid(projectId) ? projectId : null,
    projectTitle: optionalText(raw.projectTitle),
  }
}

function parseIntend(raw: unknown): OxanaUpdateTaskIntend {
  if (!isRecord(raw)) {
    return {}
  }
  const intend: OxanaUpdateTaskIntend = {}
  const title = clampText(raw.title, 200)
  if (title) intend.title = title
  if (Object.prototype.hasOwnProperty.call(raw, 'description')) {
    intend.description = optionalText(raw.description)
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'dueAt')) {
    intend.dueAt = optionalText(raw.dueAt)
  }
  const priority = asPriority(raw.priority)
  if (priority) intend.priority = priority
  const status = asStatus(raw.status)
  if (status === 'open' || status === 'in_progress') {
    intend.status = status
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'projectId')) {
    const projectId = clampText(raw.projectId, 36)
    intend.projectId = projectId && isUuid(projectId) ? projectId : null
  }
  return intend
}

function parseUpdateProposal(
  raw: Record<string, unknown>,
): OxanaUpdateTaskProposal | null {
  const taskId = clampText(raw.taskId, 36)
  const updatedAt = clampText(raw.updatedAt, 40)
  const current = snapshot(raw.current)
  const next = snapshot(raw.next)
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter(
        (item): item is OxanaUpdateField =>
          typeof item === 'string' &&
          UPDATE_FIELDS.includes(item as OxanaUpdateField),
      )
    : []
  if (!isUuid(taskId) || !updatedAt || !current || !next) {
    return null
  }
  return {
    type: 'update_task',
    taskId,
    updatedAt,
    fields,
    current,
    next,
    dueNeedsClarification: raw.dueNeedsClarification === true,
    dueAmbiguousWeekday: clampText(raw.dueAmbiguousWeekday, 40) || undefined,
  }
}

function parseChooseProposal(
  raw: Record<string, unknown>,
): OxanaChooseTaskProposal | null {
  const query = clampText(raw.query, 200)
  if (!query || !Array.isArray(raw.matches)) {
    return null
  }
  const matches = raw.matches.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }
    const id = clampText(item.id, 36)
    const title = clampText(item.title, 200)
    const priority = asPriority(item.priority)
    const status = asStatus(item.status)
    const updatedAt = clampText(item.updatedAt, 40)
    if (!isUuid(id) || !title || !priority || !status || !updatedAt) {
      return []
    }
    return [
      {
        id,
        title,
        dueAt: optionalText(item.dueAt),
        dueLabel: optionalText(item.dueLabel),
        priority,
        status,
        updatedAt,
      },
    ]
  })
  if (matches.length === 0) {
    return null
  }
  return {
    type: 'choose_task',
    query,
    matches,
    intend: parseIntend(raw.intend),
    dueNeedsClarification: raw.dueNeedsClarification === true,
    dueAmbiguousWeekday: clampText(raw.dueAmbiguousWeekday, 40) || undefined,
  }
}

function parseProposal(raw: unknown): OxanaChatProposal | undefined {
  if (!isRecord(raw) || containsSecretKey(raw)) {
    return undefined
  }
  if (raw.type === 'create_task') {
    return parseCreateProposal(raw) ?? undefined
  }
  if (raw.type === 'update_task') {
    return parseUpdateProposal(raw) ?? undefined
  }
  if (raw.type === 'choose_task') {
    return parseChooseProposal(raw) ?? undefined
  }
  return undefined
}

export function normalizeProposalStatus(
  status: unknown,
): OxanaChatProposalStatus | undefined {
  if (status === 'submitting') {
    return 'open'
  }
  if (
    status === 'open' ||
    status === 'created' ||
    status === 'updated' ||
    status === 'cancelled'
  ) {
    return status
  }
  return undefined
}

function parseTurn(raw: unknown): OxanaChatTurn | null {
  if (!isRecord(raw) || containsSecretKey(raw)) {
    return null
  }
  const text = clampText(raw.text)
  if (!text) {
    return null
  }
  if (raw.role === 'user') {
    return { role: 'user', text }
  }
  if (raw.role !== 'assistant') {
    return null
  }
  const proposal = parseProposal(raw.proposal)
  const proposalStatus = normalizeProposalStatus(raw.proposalStatus)
  const idempotencyKey = clampText(raw.idempotencyKey, 36)
  return {
    role: 'assistant',
    text,
    proposal,
    proposalStatus,
    proposalError: optionalText(raw.proposalError),
    idempotencyKey: isUuid(idempotencyKey) ? idempotencyKey : undefined,
  }
}

export function emptyOxanaChatSession(): OxanaChatSessionState {
  return { turns: [], message: '' }
}

export function parseOxanaChatSession(
  raw: unknown,
  userId: string,
  now = Date.now(),
): OxanaChatSessionState | null {
  if (!userId || !isRecord(raw) || containsSecretKey(raw)) {
    return null
  }
  if (raw.version !== SESSION_VERSION || raw.userId !== userId) {
    return null
  }
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) {
    return null
  }
  if (now - raw.savedAt > OXANA_CHAT_SESSION_MAX_AGE_MS || raw.savedAt > now + 60_000) {
    return null
  }
  if (!Array.isArray(raw.turns)) {
    return null
  }
  const turns = raw.turns
    .slice(-MAX_TURNS)
    .map(parseTurn)
    .filter((item): item is OxanaChatTurn => Boolean(item))
  return {
    turns,
    message: clampText(raw.message),
  }
}

export function loadOxanaChatSession(
  userId: string,
  storage: OxanaChatSessionStorage | null = sessionStore(),
  now = Date.now(),
): OxanaChatSessionState {
  if (!userId || !storage) {
    return emptyOxanaChatSession()
  }
  try {
    const raw = storage.getItem(oxanaChatSessionKey(userId))
    if (!raw) {
      return emptyOxanaChatSession()
    }
    const parsed = parseOxanaChatSession(JSON.parse(raw), userId, now)
    if (!parsed) {
      storage.removeItem(oxanaChatSessionKey(userId))
      return emptyOxanaChatSession()
    }
    return parsed
  } catch {
    return emptyOxanaChatSession()
  }
}

export function saveOxanaChatSession(
  userId: string,
  state: OxanaChatSessionState,
  storage: OxanaChatSessionStorage | null = sessionStore(),
  now = Date.now(),
): void {
  if (!userId || !storage) {
    return
  }
  const payload = {
    version: SESSION_VERSION,
    userId,
    savedAt: now,
    message: clampText(state.message),
    turns: state.turns.slice(-MAX_TURNS).map((turn) => {
      if (turn.role === 'user') {
        return { role: 'user', text: clampText(turn.text) }
      }
      return {
        role: 'assistant',
        text: clampText(turn.text),
        proposal: turn.proposal,
        proposalStatus: normalizeProposalStatus(turn.proposalStatus),
        proposalError: turn.proposalError ?? null,
        idempotencyKey: turn.idempotencyKey,
      }
    }),
  }
  if (containsSecretKey(payload)) {
    return
  }
  const serialized = JSON.stringify(payload)
  if (serialized.length > MAX_JSON_CHARS) {
    return
  }
  try {
    storage.setItem(oxanaChatSessionKey(userId), serialized)
  } catch {
    // Quota or private mode: keep in-memory chat only.
  }
}

export function clearOxanaChatSession(
  userId: string,
  storage: OxanaChatSessionStorage | null = sessionStore(),
): void {
  if (!userId || !storage) {
    return
  }
  try {
    storage.removeItem(oxanaChatSessionKey(userId))
  } catch {
    // ignore
  }
}

export function clearAllOxanaChatSessions(
  storage: OxanaChatSessionStorage | null = sessionStore(),
): void {
  if (!storage) {
    return
  }
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(OXANA_CHAT_SESSION_PREFIX)) {
      keys.push(key)
    }
  }
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // ignore
    }
  }
}
