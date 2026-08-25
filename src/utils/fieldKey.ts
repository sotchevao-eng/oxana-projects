/** Build a safe field_key from a Russian/English label. */
export function slugifyFieldKey(label: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  const lowered = label.trim().toLowerCase()
  let result = ''
  for (const char of lowered) {
    if (/[a-z0-9]/.test(char)) {
      result += char
    } else if (char in map) {
      result += map[char]
    } else if (/\s|-|—|–/.test(char)) {
      result += '_'
    } else if (char === '_') {
      result += '_'
    }
  }

  result = result.replace(/_+/g, '_').replace(/^_|_$/g, '')
  return result || 'field'
}

export function isValidFieldKey(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value)
}

export function ensureUniqueFieldKey(
  base: string,
  existing: string[],
  currentId?: string,
): string {
  const used = new Set(
    existing
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean),
  )

  // current key belonging to the edited field is allowed
  let candidate = base.trim().toLowerCase() || 'field'
  if (!isValidFieldKey(candidate)) {
    candidate = slugifyFieldKey(candidate)
  }

  if (!used.has(candidate) || currentId) {
    // If editing and keeping same key, caller should exclude current from existing
  }

  if (!used.has(candidate)) {
    return candidate
  }

  let index = 2
  while (used.has(`${candidate}_${index}`)) {
    index += 1
  }
  return `${candidate}_${index}`
}
