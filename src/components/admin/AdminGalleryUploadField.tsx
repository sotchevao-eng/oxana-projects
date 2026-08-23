import { useRef, useState, type DragEvent } from 'react'
import { GripVertical, ImagePlus, Trash2 } from 'lucide-react'
import type { ProjectGalleryImage } from '../../types'
import { uploadProjectImage } from '../../services/storageService'
import { useToast } from '../ToastProvider'

interface AdminGalleryUploadFieldProps {
  images: ProjectGalleryImage[]
  projectKey: string
  disabled?: boolean
  onChange: (images: ProjectGalleryImage[]) => void
}

export function AdminGalleryUploadField({
  images,
  projectKey,
  disabled = false,
  onChange,
}: AdminGalleryUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
      return
    }

    const next = [...images]
    const [moved] = next.splice(from, 1)
    if (!moved) {
      return
    }
    next.splice(to, 0, moved)
    onChange(
      next.map((image, index) => ({
        ...image,
        sortOrder: index + 1,
      })),
    )
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length || uploading || disabled) {
      return
    }

    setUploading(true)
    const uploaded: ProjectGalleryImage[] = []

    for (const file of list) {
      const result = await uploadProjectImage(file, {
        projectKey,
        kind: 'gallery',
      })

      if (!result.ok || !result.url) {
        showToast(result.error ?? 'Ошибка загрузки изображения', 'error')
        continue
      }

      uploaded.push({
        id: null,
        url: result.url,
        alt: file.name,
        sortOrder: images.length + uploaded.length + 1,
      })
    }

    setUploading(false)

    if (uploaded.length > 0) {
      const merged = [...images, ...uploaded].map((image, index) => ({
        ...image,
        sortOrder: index + 1,
      }))
      onChange(merged)
      showToast(
        uploaded.length === 1
          ? 'Изображение добавлено в галерею'
          : `Добавлено изображений: ${uploaded.length}`,
        'success',
      )
    }
  }

  const removeAt = (index: number) => {
    const next = images
      .filter((_, itemIndex) => itemIndex !== index)
      .map((image, itemIndex) => ({
        ...image,
        sortOrder: itemIndex + 1,
      }))
    onChange(next)
  }

  const onDropUpload = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer.files?.length) {
      void handleFiles(event.dataTransfer.files)
    }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">Галерея</p>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink hover:bg-soft disabled:opacity-50"
        >
          {uploading ? 'Загрузка...' : 'Добавить изображения'}
        </button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropUpload}
        className={`rounded-xl border border-dashed p-4 transition-colors ${
          dragOver ? 'border-ink bg-soft' : 'border-border bg-bg'
        }`}
      >
        {images.length === 0 ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 py-8 text-sm text-muted disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
            <span>Перетащите несколько изображений сюда</span>
            <span className="text-xs">JPG, PNG, WEBP, GIF · до 5 МБ каждое</span>
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => (
              <div
                key={`${image.url}-${index}`}
                draggable={!disabled}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragIndex === null) {
                    return
                  }
                  reorder(dragIndex, index)
                  setDragIndex(null)
                }}
                className="group overflow-hidden rounded-xl border border-border bg-surface"
              >
                <div className="relative">
                  <img
                    src={image.url}
                    alt={image.alt ?? `Галерея ${index + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-ink/50 to-transparent p-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-1 text-[10px] text-ink">
                      <GripVertical className="h-3 w-3" />
                      {image.sortOrder}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeAt(index)}
                      className="rounded-md bg-surface/90 p-1.5 text-red-500 hover:bg-surface disabled:opacity-50"
                      aria-label="Удалить изображение"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          if (event.target.files?.length) {
            void handleFiles(event.target.files)
          }
          event.target.value = ''
        }}
      />
    </div>
  )
}
