import { useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { uploadSiteHeroImage } from '../../services/storageService'
import { useToast } from '../ToastProvider'

interface AdminHeroImageFieldProps {
  value: string
  disabled?: boolean
  onChange: (url: string) => void
}

export function AdminHeroImageField({
  value,
  disabled = false,
  onChange,
}: AdminHeroImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0]
    if (!file || uploading || disabled) {
      return
    }

    setUploading(true)
    const result = await uploadSiteHeroImage(file)
    setUploading(false)

    if (!result.ok || !result.url) {
      showToast(result.error ?? 'Ошибка загрузки изображения', 'error')
      return
    }

    onChange(result.url)
    showToast('Изображение загружено', 'success')
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">Изображение на главной</p>
      <p className="text-xs text-muted">
        Показывается справа в первом экране. Если пусто — используется
        фирменная иллюстрация.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDragOver(false)
          if (event.dataTransfer.files?.length) {
            void handleFiles(event.dataTransfer.files)
          }
        }}
        className={`rounded-xl border border-dashed p-3 transition-colors ${
          dragOver ? 'border-accent bg-soft' : 'border-border bg-bg'
        }`}
      >
        {value ? (
          <div className="space-y-3">
            <img
              src={value}
              alt="Изображение на главной"
              className="aspect-[16/10] w-full rounded-lg object-cover"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink hover:bg-soft disabled:opacity-50"
              >
                Заменить
              </button>
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-red-400 hover:bg-soft disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg px-4 py-8 text-center text-sm text-muted hover:bg-soft/70 disabled:opacity-50"
          >
            {uploading ? (
              <Upload className="h-5 w-5 animate-pulse" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <span>
              {uploading
                ? 'Загрузка...'
                : 'Перетащите изображение или нажмите для выбора'}
            </span>
            <span className="text-xs">JPG, PNG, WEBP, GIF · до 5 МБ</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
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
