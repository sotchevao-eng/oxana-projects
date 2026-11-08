export const DEFAULT_OXANA_TIMEZONE = 'Europe/Moscow'

export const OXANA_TIMEZONES = [
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Asia/Vladivostok',
  'UTC',
] as const

export function normalizeOxanaTimezone(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return (OXANA_TIMEZONES as readonly string[]).includes(trimmed)
    ? trimmed
    : DEFAULT_OXANA_TIMEZONE
}

export function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = tzOffsetMs(new Date(utcGuess), timeZone)
  return new Date(utcGuess - offset)
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const locale = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(locale.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  )
  return asUtc - date.getTime()
}

export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    weekday: read('weekday'),
    dateKey: `${read('year')}-${read('month')}-${read('day')}`,
  }
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone)
  return zonedDate(parts.year, parts.month, parts.day, 0, 0, timeZone)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

export function toDateTimeLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const parts = zonedParts(new Date(iso), timeZone)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function fromDateTimeLocal(
  value: string,
  timeZone: string,
): string | undefined {
  if (!value) return undefined
  const [date, time] = value.split('T')
  if (!date || !time) return undefined
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return undefined
  }
  return zonedDate(year, month, day, hour, minute, timeZone).toISOString()
}

export function formatOxanaDate(
  iso: string | null | undefined,
  timeZone: string,
  mode: 'date' | 'datetime' = 'datetime',
): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(mode === 'datetime'
      ? { hour: '2-digit', minute: '2-digit' }
      : {}),
  }).format(new Date(iso))
}

export function formatOxanaMonthTitle(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  return zonedParts(a, timeZone).dateKey === zonedParts(b, timeZone).dateKey
}

export function parseOxanaChatSentAt(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString()
}

export function formatOxanaChatTimestamp(
  iso: string | null | undefined,
  now: Date = new Date(),
  timeZone = DEFAULT_OXANA_TIMEZONE,
): string | null {
  const sentAt = parseOxanaChatSentAt(iso)
  if (!sentAt) {
    return null
  }
  const zone = normalizeOxanaTimezone(timeZone)
  const at = new Date(sentAt)
  const parts = zonedParts(at, zone)
  const pad = (value: number) => String(value).padStart(2, '0')
  const clock = `${pad(parts.hour)}:${pad(parts.minute)}`
  if (isSameZonedDay(at, now, zone)) {
    return clock
  }
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year} ${clock}`
}

export function msUntilNextOxanaMidnight(
  now: Date = new Date(),
  timeZone = DEFAULT_OXANA_TIMEZONE,
): number {
  const zone = normalizeOxanaTimezone(timeZone)
  const next = addDays(startOfZonedDay(now, zone), 1)
  return Math.max(1, next.getTime() - now.getTime())
}
