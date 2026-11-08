import { normalizeTimezone, startOfDay, zonedDate } from './time.js'

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})[tT ](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/
const RU_MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
}
const RU_CALENDAR_RE =
  /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})(?:\s*года)?(?:\s*,?\s*(?:в\s+)?(\d{1,2})[:.](\d{2}))?/i
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
  const zone = normalizeTimezone(timezone)
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
  }).format(due)
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(due)
  const hour = Number(clock.find((part) => part.type === 'hour')?.value)
  const minute = Number(clock.find((part) => part.type === 'minute')?.value)
  if (hour === 23 && minute === 59) {
    return dateLabel
  }
  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(due)
  return `${dateLabel}, ${timeLabel}`
}

export function dueAmbiguousReply(weekday = 'этот день недели'): string {
  return `Сегодня ${weekday}. Уточните: срок на сегодня или на следующую неделю? Срок сама не выбираю.`
}

export const OXANA_INVALID_DUE_REPLY =
  'Не поняла срок. Укажите дату как «13 ноября 2026, 18:00» или YYYY-MM-DD. Задачу не меняю.'

export function extractCalendarDueToken(message: string): string | null {
  const text = message.trim()
  const russian = RU_CALENDAR_RE.exec(text)
  if (russian) {
    const day = Number(russian[1])
    const month = RU_MONTHS[russian[2].toLowerCase()]
    const year = Number(russian[3])
    if (!month) {
      return null
    }
    const token = ymdToken(year, month, day)
    if (!token) {
      return null
    }
    if (russian[4] !== undefined && russian[5] !== undefined) {
      return withTime(token, Number(russian[4]), Number(russian[5]))
    }
    return token
  }
  const iso = text.match(
    /(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/i,
  )
  if (!iso || iso[4]) {
    return null
  }
  if (iso[2] !== undefined && iso[3] !== undefined) {
    return withTime(iso[1], Number(iso[2]), Number(iso[3]))
  }
  return iso[1]
}

function ymdToken(year: number, month: number, day: number): string | null {
  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function withTime(date: string, hour: number, minute: number): string | null {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return { ok: false, error: 'invalid_due_at' }
  }

  const dateTime = DATE_TIME_LOCAL_RE.exec(value)
  const match = dateTime ?? DATE_ONLY_RE.exec(value)
  if (!match) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = dateTime ? Number(dateTime[4]) : 23
  const minute = dateTime ? Number(dateTime[5]) : 59
  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const todayStart = startOfDay(now, zone)
  const due = zonedDate(year, month, day, hour, minute, zone)
  const latest = new Date(
    todayStart.getTime() + MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000,
  )
  if (due.getTime() < todayStart.getTime() || due.getTime() > latest.getTime()) {
    return { ok: false, error: 'invalid_due_at' }
  }
  const includeTime = hour !== 23 || minute !== 59
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
  }).format(due)
  if (!includeTime) {
    return { ok: true, dueAt: due.toISOString(), dueLabel: dateLabel }
  }
  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(due)
  return {
    ok: true,
    dueAt: due.toISOString(),
    dueLabel: `${dateLabel}, ${timeLabel}`,
  }
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
