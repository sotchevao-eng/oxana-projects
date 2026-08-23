import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'

export const PROJECT_IMAGES_BUCKET = 'project-images'
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

export interface UploadImageResult {
  ok: boolean
  url?: string
  path?: string
  error?: string
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? (parts.at(-1) ?? '') : ''
}

function looksLikeImageByMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true
  }

  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true
  }

  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true
  }

  return false
}

async function canDecodeAsImage(file: File): Promise<boolean> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      bitmap.close()
      return true
    } catch {
      return false
    }
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(true)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(false)
    }
    image.src = url
  })
}

export async function validateImageFile(
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file || file.size <= 0) {
    return { ok: false, error: 'Файл пустой или не выбран.' }
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: 'Слишком большой файл. Максимум 5 МБ.',
    }
  }

  const extension = getExtension(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      error: 'Недопустимый тип файла. Разрешены JPG, PNG, WEBP и GIF.',
    }
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: 'Недопустимый MIME-тип. Разрешены только безопасные изображения.',
    }
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!looksLikeImageByMagicBytes(header)) {
    return {
      ok: false,
      error: 'Файл не похож на изображение. Загрузка отклонена.',
    }
  }

  const decoded = await canDecodeAsImage(file)
  if (!decoded) {
    return {
      ok: false,
      error: 'Не удалось прочитать изображение. Файл повреждён или опасен.',
    }
  }

  return { ok: true }
}

function buildObjectPath(
  projectKey: string,
  kind: 'cover' | 'card' | 'gallery',
  file: File,
): string {
  const extension = getExtension(file.name) || 'jpg'
  const safeName = `${kind}-${crypto.randomUUID()}.${extension}`
  return `projects/${projectKey}/${safeName}`
}

export async function uploadSiteHeroImage(file: File): Promise<UploadImageResult> {
  const validation = await validateImageFile(file)
  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase не настроен. Добавьте ключи в .env.',
    }
  }

  const client = getSupabaseClient()
  if (!client) {
    return {
      ok: false,
      error: 'Не удалось подключиться к Supabase Storage.',
    }
  }

  const extension = getExtension(file.name) || 'jpg'
  const path = `site/hero-${crypto.randomUUID()}.${extension}`

  const { error } = await client.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    return {
      ok: false,
      error: error.message || 'Не удалось загрузить изображение.',
    }
  }

  const { data } = client.storage.from(PROJECT_IMAGES_BUCKET).getPublicUrl(path)

  return {
    ok: true,
    url: data.publicUrl,
    path,
  }
}

export async function uploadProjectImage(
  file: File,
  options: {
    projectKey: string
    kind: 'cover' | 'card' | 'gallery'
  },
): Promise<UploadImageResult> {
  const validation = await validateImageFile(file)
  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase не настроен. Добавьте ключи в .env.',
    }
  }

  const client = getSupabaseClient()
  if (!client) {
    return {
      ok: false,
      error: 'Не удалось подключиться к Supabase Storage.',
    }
  }

  const path = buildObjectPath(options.projectKey, options.kind, file)

  const { error } = await client.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    return {
      ok: false,
      error: error.message || 'Не удалось загрузить изображение.',
    }
  }

  const { data } = client.storage.from(PROJECT_IMAGES_BUCKET).getPublicUrl(path)

  return {
    ok: true,
    url: data.publicUrl,
    path,
  }
}

export async function deleteProjectImagesFolder(
  projectKey: string,
): Promise<void> {
  const client = getSupabaseClient()
  if (!client || !isSupabaseConfigured()) {
    return
  }

  const folder = `projects/${projectKey}`
  const { data, error } = await client.storage
    .from(PROJECT_IMAGES_BUCKET)
    .list(folder)

  if (error || !data || data.length === 0) {
    return
  }

  const paths = data
    .map((item) => item.name)
    .filter(Boolean)
    .map((name) => `${folder}/${name}`)

  if (paths.length === 0) {
    return
  }

  await client.storage.from(PROJECT_IMAGES_BUCKET).remove(paths)
}
