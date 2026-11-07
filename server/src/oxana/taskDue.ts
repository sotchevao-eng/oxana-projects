import { normalizeTimezone, startOfDay, zonedDate } from './time.js'

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_AHEAD_DAYS = 366

export function resolveProposedDueAt(
  raw: unknown,
  timezone: string,
  now = new Date(),
):
  | { ok: true; dueAt: string | null; dueLabel: string | null }
  | { ok: false; error: 'invalid_due_at' } {
  const zone = normalizeTimezone(timezone)
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, dueAt: null, dueLabel: null }
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'invalid_due_at' }
  }
  const value = raw.trim().toLowerCase()
  if (!value || value === 'none' || value === 'нет') {
    return { ok: true, dueAt: null, dueLabel: null }
  }

  const today = ymdInZone(now, zone)
  if (value === 'today' || value === 'сегодня') {
    return stamp(today.year, today.month, today.day, zone, 'сегодня')
  }
  if (value === 'tomorrow' || value === 'завтра') {
    const next = shiftYmd(today.year, today.month, today.day, 1)
    return stamp(next.year, next.month, next.day, zone, 'завтра')
  }

  const match = DATE_ONLY_RE.exec(value)
  if (!match) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const todayStart = startOfDay(now, zone)
  const due = zonedDate(year, month, day, 23, 59, zone)
  const latest = new Date(
    todayStart.getTime() + MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000,
  )
  if (due.getTime() < todayStart.getTime() || due.getTime() > latest.getTime()) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const label = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
  }).format(due)
  return { ok: true, dueAt: due.toISOString(), dueLabel: label }
}

function ymdInZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

function shiftYmd(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

function stamp(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  dueLabel: string,
) {
  return {
    ok: true as const,
    dueAt: zonedDate(year, month, day, 23, 59, timeZone).toISOString(),
    dueLabel,
  }
}
