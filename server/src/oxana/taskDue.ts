import { normalizeTimezone, startOfDay, zonedDate } from './time.js'

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_AHEAD_DAYS = 366

const WEEKDAY_TOKENS: Record<string, { dow: number; label: string }> = {
  sunday: { dow: 0, label: 'воскресенье' },
  воскресенье: { dow: 0, label: 'воскресенье' },
  воскресенья: { dow: 0, label: 'воскресенье' },
  воскресенью: { dow: 0, label: 'воскресенье' },
  monday: { dow: 1, label: 'понедельник' },
  понедельник: { dow: 1, label: 'понедельник' },
  понедельника: { dow: 1, label: 'понедельник' },
  понедельнику: { dow: 1, label: 'понедельник' },
  tuesday: { dow: 2, label: 'вторник' },
  вторник: { dow: 2, label: 'вторник' },
  вторника: { dow: 2, label: 'вторник' },
  вторнику: { dow: 2, label: 'вторник' },
  wednesday: { dow: 3, label: 'среда' },
  среда: { dow: 3, label: 'среда' },
  среду: { dow: 3, label: 'среда' },
  среды: { dow: 3, label: 'среда' },
  thursday: { dow: 4, label: 'четверг' },
  четверг: { dow: 4, label: 'четверг' },
  четверга: { dow: 4, label: 'четверг' },
  четвергу: { dow: 4, label: 'четверг' },
  friday: { dow: 5, label: 'пятница' },
  пятница: { dow: 5, label: 'пятница' },
  пятницу: { dow: 5, label: 'пятница' },
  пятницы: { dow: 5, label: 'пятница' },
  saturday: { dow: 6, label: 'суббота' },
  суббота: { dow: 6, label: 'суббота' },
  субботу: { dow: 6, label: 'суббота' },
  субботы: { dow: 6, label: 'суббота' },
}

export function formatDueLabel(
  iso: string | null | undefined,
  timezone: string,
): string | null {
  if (!iso) {
    return null
  }
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: normalizeTimezone(timezone),
    day: 'numeric',
    month: 'long',
  }).format(due)
}

export function dueAmbiguousReply(weekday = 'этот день недели'): string {
  return `Сегодня ${weekday}. Уточните: срок на сегодня или на следующую неделю? Срок сама не выбираю.`
}

export function resolveProposedDueAt(
  raw: unknown,
  timezone: string,
  now = new Date(),
):
  | { ok: true; dueAt: string | null; dueLabel: string | null }
  | { ok: false; error: 'invalid_due_at' }
  | { ok: false; error: 'due_ambiguous'; weekday: string } {
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

  const weekday = WEEKDAY_TOKENS[value]
  if (weekday) {
    const currentDow = weekdayOfYmd(today.year, today.month, today.day)
    const delta = (weekday.dow - currentDow + 7) % 7
    if (delta === 0) {
      return { ok: false, error: 'due_ambiguous', weekday: weekday.label }
    }
    const next = shiftYmd(today.year, today.month, today.day, delta)
    return stamp(next.year, next.month, next.day, zone, weekday.label)
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

function weekdayOfYmd(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
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
