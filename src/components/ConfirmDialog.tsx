import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../hooks/useScrollLock'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  confirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, confirming, onCancel])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => {
        if (!confirming) {
          onCancel()
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-ink"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-description"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:bg-soft disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {confirming ? 'Удаление...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
