export const DEFAULT_TIMEZONE = 'Europe/Moscow'

const ALLOWED_TIMEZONES = new Set([
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Asia/Vladivostok',
  'UTC',
])

export function normalizeTimezone(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return ALLOWED_TIMEZONES.has(trimmed) ? trimmed : DEFAULT_TIMEZONE
}

export function startOfDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return zonedDate(year, month, day, 0, 0, timeZone)
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
