import type {
  CreateEventInput,
  CreateProjectInput,
  CreateTaskInput,
  OxanaNotificationSource,
  OxanaOwnerSettings,
  OxanaProjectStatus,
  OxanaTaskPriority,
  OxanaTaskStatus,
  UpdateEventInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './types.js'
import { normalizeTimezone } from './time.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TASK_STATUSES: readonly OxanaTaskStatus[] = [
  'open',
  'in_progress',
  'done',
  'cancelled',
]

const PROJECT_STATUSES: readonly OxanaProjectStatus[] = [
  'planned',
  'active',
  'paused',
  'done',
  'archived',
]

const TASK_PRIORITIES: readonly OxanaTaskPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
]

const SOURCE_RE = /\[\[(task|project|event):([0-9a-f-]{36})\]\]/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function clampText(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function parseTaskCreate(body: unknown):
  | { ok: true; data: CreateTaskInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const title = clampText(record.title, 200)
  const description = clampText(record.description, 4000)
  const projectIdRaw = clampText(record.projectId ?? record.project_id, 36)
  const dueAt = parseOptionalIso(record.dueAt ?? record.due_at, 'invalid_due_at')
  const priority = parsePriority(record.priority)

  if (!title) {
    return { ok: false, error: 'title_required' }
  }

  if (projectIdRaw && !isUuid(projectIdRaw)) {
    return { ok: false, error: 'invalid_project_id' }
  }

  if (!dueAt.ok) return dueAt
  if (!priority.ok) return priority

  return {
    ok: true,
    data: {
      title,
      description: description || null,
      projectId: projectIdRaw || null,
      dueAt: dueAt.value,
      priority: priority.value,
    },
  }
}

export function parseTaskStatus(body: unknown):
  | { ok: true; status: OxanaTaskStatus }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const status = clampText((body as Record<string, unknown>).status, 32)
  if (!TASK_STATUSES.includes(status as OxanaTaskStatus)) {
    return { ok: false, error: 'invalid_status' }
  }
  return { ok: true, status: status as OxanaTaskStatus }
}

export function parseTaskPatch(body: unknown):
  | { ok: true; data: UpdateTaskInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const hasStatus = Object.prototype.hasOwnProperty.call(record, 'status')
  const hasProject =
    Object.prototype.hasOwnProperty.call(record, 'projectId') ||
    Object.prototype.hasOwnProperty.call(record, 'project_id')

  const hasTitle = Object.prototype.hasOwnProperty.call(record, 'title')
  const hasDescription = Object.prototype.hasOwnProperty.call(
    record,
    'description',
  )
  const hasDue =
    Object.prototype.hasOwnProperty.call(record, 'dueAt') ||
    Object.prototype.hasOwnProperty.call(record, 'due_at')
  const hasPriority = Object.prototype.hasOwnProperty.call(record, 'priority')
  const hasArchived =
    Object.prototype.hasOwnProperty.call(record, 'archivedAt') ||
    Object.prototype.hasOwnProperty.call(record, 'archived_at')

  if (
    !hasStatus &&
    !hasProject &&
    !hasTitle &&
    !hasDescription &&
    !hasDue &&
    !hasPriority &&
    !hasArchived
  ) {
    return { ok: false, error: 'validation_failed' }
  }

  const data: UpdateTaskInput = {}

  if (hasStatus) {
    const status = clampText(record.status, 32)
    if (!TASK_STATUSES.includes(status as OxanaTaskStatus)) {
      return { ok: false, error: 'invalid_status' }
    }
    data.status = status as OxanaTaskStatus
  }

  if (hasProject) {
    const raw = record.projectId ?? record.project_id
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      data.projectId = null
    } else {
      const projectId = clampText(raw, 36)
      if (!isUuid(projectId)) {
        return { ok: false, error: 'invalid_project_id' }
      }
      data.projectId = projectId
    }
  }

  if (hasTitle) {
    const title = clampText(record.title, 200)
    if (!title) {
      return { ok: false, error: 'title_required' }
    }
    data.title = title
  }

  if (hasDescription) {
    data.description = clampText(record.description, 4000) || null
  }

  if (hasDue) {
    const dueAt = parseOptionalIso(record.dueAt ?? record.due_at, 'invalid_due_at')
    if (!dueAt.ok) return dueAt
    data.dueAt = dueAt.value
  }

  if (hasPriority) {
    const priority = parsePriority(record.priority, true)
    if (!priority.ok) return priority
    data.priority = priority.value
  }

  if (hasArchived) {
    const archived = parseOptionalIso(
      record.archivedAt ?? record.archived_at,
      'invalid_archived_at',
    )
    if (!archived.ok) return archived
    data.archivedAt = archived.value
  }

  return { ok: true, data }
}

export function parseExpectedUpdatedAt(body: unknown):
  | { ok: true; value: string | undefined }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: true, value: undefined }
  }
  const record = body as Record<string, unknown>
  if (
    !Object.prototype.hasOwnProperty.call(record, 'expectedUpdatedAt') &&
    !Object.prototype.hasOwnProperty.call(record, 'expected_updated_at')
  ) {
    return { ok: true, value: undefined }
  }
  const parsed = parseOptionalIso(
    record.expectedUpdatedAt ?? record.expected_updated_at,
    'invalid_expected_updated_at',
  )
  if (!parsed.ok) {
    return parsed
  }
  return { ok: true, value: parsed.value ?? undefined }
}

export function parseTaskUpdateIntend(body: unknown):
  | { ok: true; data: UpdateTaskInput }
  | { ok: false; error: string } {
  const parsed = parseTaskPatch(body)
  if (!parsed.ok) {
    return parsed
  }
  if (Object.prototype.hasOwnProperty.call(parsed.data, 'archivedAt')) {
    return { ok: false, error: 'validation_failed' }
  }
  if (parsed.data.status === 'done' || parsed.data.status === 'cancelled') {
    return { ok: false, error: 'invalid_status' }
  }
  const data: UpdateTaskInput = { ...parsed.data }
  delete data.archivedAt
  if (
    data.title === undefined &&
    !Object.prototype.hasOwnProperty.call(data, 'description') &&
    !Object.prototype.hasOwnProperty.call(data, 'dueAt') &&
    data.priority === undefined &&
    data.status === undefined &&
    !Object.prototype.hasOwnProperty.call(data, 'projectId')
  ) {
    return { ok: false, error: 'validation_failed' }
  }
  return { ok: true, data }
}

function parseIso(value: unknown, error: string): { ok: true; value: string } | { ok: false; error: string } {
  const raw = clampText(value, 40)
  if (!raw) {
    return { ok: false, error }
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error }
  }
  return { ok: true, value: parsed.toISOString() }
}

function parseOptionalIso(
  value: unknown,
  error: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { ok: true, value: null }
  }
  const parsed = parseIso(value, error)
  if (!parsed.ok) return parsed
  return { ok: true, value: parsed.value }
}

function parsePriority(
  value: unknown,
  required = false,
):
  | { ok: true; value: OxanaTaskPriority }
  | { ok: false; error: string } {
  const raw = clampText(value, 16)
  if (!raw) {
    if (required) return { ok: false, error: 'invalid_priority' }
    return { ok: true, value: 'normal' }
  }
  if (!TASK_PRIORITIES.includes(raw as OxanaTaskPriority)) {
    return { ok: false, error: 'invalid_priority' }
  }
  return { ok: true, value: raw as OxanaTaskPriority }
}

function parseOptionalProjectId(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { ok: true, value: null }
  }
  const projectId = clampText(value, 36)
  if (!isUuid(projectId)) {
    return { ok: false, error: 'invalid_project_id' }
  }
  return { ok: true, value: projectId }
}

export function parseNotificationSource(
  body: string | null | undefined,
): { sourceType: OxanaNotificationSource; sourceId: string } | null {
  const match = String(body ?? '').match(SOURCE_RE)
  if (!match) return null
  return {
    sourceType: match[1].toLowerCase() as OxanaNotificationSource,
    sourceId: match[2],
  }
}

export function parseProjectPatch(body: unknown):
  | { ok: true; data: UpdateProjectInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const data: UpdateProjectInput = {}
  if (Object.prototype.hasOwnProperty.call(record, 'title')) {
    const title = clampText(record.title, 200)
    if (!title) return { ok: false, error: 'title_required' }
    data.title = title
  }
  if (Object.prototype.hasOwnProperty.call(record, 'description')) {
    data.description = clampText(record.description, 4000) || null
  }
  if (Object.prototype.hasOwnProperty.call(record, 'status')) {
    const status = clampText(record.status, 32)
    if (!PROJECT_STATUSES.includes(status as OxanaProjectStatus)) {
      return { ok: false, error: 'invalid_status' }
    }
    data.status = status as OxanaProjectStatus
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'startsAt') ||
    Object.prototype.hasOwnProperty.call(record, 'starts_at')
  ) {
    const startsAt = parseOptionalIso(
      record.startsAt ?? record.starts_at,
      'invalid_starts_at',
    )
    if (!startsAt.ok) return startsAt
    data.startsAt = startsAt.value
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'dueAt') ||
    Object.prototype.hasOwnProperty.call(record, 'due_at')
  ) {
    const dueAt = parseOptionalIso(record.dueAt ?? record.due_at, 'invalid_due_at')
    if (!dueAt.ok) return dueAt
    data.dueAt = dueAt.value
  }
  if (!Object.keys(data).length) {
    return { ok: false, error: 'validation_failed' }
  }
  return { ok: true, data }
}

export function parseEventCreate(body: unknown):
  | { ok: true; data: CreateEventInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const title = clampText(record.title, 200)
  if (!title) return { ok: false, error: 'title_required' }
  const starts = parseIso(record.startsAt ?? record.starts_at, 'invalid_starts_at')
  if (!starts.ok) return starts
  let endsAt: string | null = null
  const endsRaw = record.endsAt ?? record.ends_at
  if (endsRaw !== null && endsRaw !== undefined && String(endsRaw).trim()) {
    const ends = parseIso(endsRaw, 'invalid_ends_at')
    if (!ends.ok) return ends
    endsAt = ends.value
  }
  let remindAt: string | null = null
  const remindRaw = record.remindAt ?? record.remind_at
  if (remindRaw !== null && remindRaw !== undefined && String(remindRaw).trim()) {
    const remind = parseIso(remindRaw, 'invalid_remind_at')
    if (!remind.ok) return remind
    remindAt = remind.value
  }
  const description = clampText(record.description, 4000)
  const projectId = parseOptionalProjectId(record.projectId ?? record.project_id)
  if (!projectId.ok) return projectId
  return {
    ok: true,
    data: {
      title,
      description: description || null,
      startsAt: starts.value,
      endsAt,
      remindAt,
      projectId: projectId.value,
    },
  }
}

export function parseEventPatch(body: unknown):
  | { ok: true; data: UpdateEventInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const data: UpdateEventInput = {}
  if (Object.prototype.hasOwnProperty.call(record, 'title')) {
    const title = clampText(record.title, 200)
    if (!title) return { ok: false, error: 'title_required' }
    data.title = title
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'startsAt') ||
    Object.prototype.hasOwnProperty.call(record, 'starts_at')
  ) {
    const starts = parseIso(record.startsAt ?? record.starts_at, 'invalid_starts_at')
    if (!starts.ok) return starts
    data.startsAt = starts.value
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'endsAt') ||
    Object.prototype.hasOwnProperty.call(record, 'ends_at')
  ) {
    const raw = record.endsAt ?? record.ends_at
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      data.endsAt = null
    } else {
      const ends = parseIso(raw, 'invalid_ends_at')
      if (!ends.ok) return ends
      data.endsAt = ends.value
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'remindAt') ||
    Object.prototype.hasOwnProperty.call(record, 'remind_at')
  ) {
    const raw = record.remindAt ?? record.remind_at
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      data.remindAt = null
    } else {
      const remind = parseIso(raw, 'invalid_remind_at')
      if (!remind.ok) return remind
      data.remindAt = remind.value
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'description')) {
    data.description = clampText(record.description, 4000) || null
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'projectId') ||
    Object.prototype.hasOwnProperty.call(record, 'project_id')
  ) {
    const projectId = parseOptionalProjectId(record.projectId ?? record.project_id)
    if (!projectId.ok) return projectId
    data.projectId = projectId.value
  }
  if (!Object.keys(data).length) {
    return { ok: false, error: 'validation_failed' }
  }
  return { ok: true, data }
}

export function parseSettingsPatch(body: unknown):
  | { ok: true; data: Partial<OxanaOwnerSettings> }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const data: Partial<OxanaOwnerSettings> = {}
  if (Object.prototype.hasOwnProperty.call(record, 'displayName')) {
    data.displayName = clampText(record.displayName, 80)
  }
  if (Object.prototype.hasOwnProperty.call(record, 'timezone')) {
    data.timezone = normalizeTimezone(String(record.timezone))
  }
  if (Object.prototype.hasOwnProperty.call(record, 'dateFormat')) {
    const format = clampText(record.dateFormat, 16)
    if (format !== 'date' && format !== 'datetime') {
      return { ok: false, error: 'validation_failed' }
    }
    data.dateFormat = format
  }
  for (const key of [
    'notifyTaskDueSoon',
    'notifyTaskDueDay',
    'notifyTaskOverdue',
    'notifyEvent',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      data[key] = Boolean(record[key])
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'taskSoonHours')) {
    const hours = Number(record.taskSoonHours)
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      return { ok: false, error: 'validation_failed' }
    }
    data.taskSoonHours = Math.round(hours)
  }
  if (Object.prototype.hasOwnProperty.call(record, 'eventSoonMinutes')) {
    const minutes = Number(record.eventSoonMinutes)
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 24 * 60) {
      return { ok: false, error: 'validation_failed' }
    }
    data.eventSoonMinutes = Math.round(minutes)
  }
  if (!Object.keys(data).length) {
    return { ok: false, error: 'validation_failed' }
  }
  return { ok: true, data }
}

export function parseProjectCreate(body: unknown):
  | { ok: true; data: CreateProjectInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'validation_failed' }
  }
  const record = body as Record<string, unknown>
  const title = clampText(record.title, 200)
  const description = clampText(record.description, 4000)
  if (!title) {
    return { ok: false, error: 'title_required' }
  }
  let status: OxanaProjectStatus = 'active'
  if (Object.prototype.hasOwnProperty.call(record, 'status')) {
    const raw = clampText(record.status, 32)
    if (!PROJECT_STATUSES.includes(raw as OxanaProjectStatus)) {
      return { ok: false, error: 'invalid_status' }
    }
    status = raw as OxanaProjectStatus
  }
  const startsAt = parseOptionalIso(
    record.startsAt ?? record.starts_at,
    'invalid_starts_at',
  )
  if (!startsAt.ok) return startsAt
  const dueAt = parseOptionalIso(record.dueAt ?? record.due_at, 'invalid_due_at')
  if (!dueAt.ok) return dueAt
  return {
    ok: true,
    data: {
      title,
      description: description || null,
      status,
      startsAt: startsAt.value,
      dueAt: dueAt.value,
    },
  }
}

export function isTaskPriority(value: string): value is OxanaTaskPriority {
  return TASK_PRIORITIES.includes(value as OxanaTaskPriority)
}

export function isTaskStatus(value: string): value is OxanaTaskStatus {
  return TASK_STATUSES.includes(value as OxanaTaskStatus)
}

export function isProjectStatus(value: string): value is OxanaProjectStatus {
  return PROJECT_STATUSES.includes(value as OxanaProjectStatus)
}
