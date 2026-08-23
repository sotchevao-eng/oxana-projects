import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataStatus } from '../../components/DataStatus'
import { useToast } from '../../components/ToastProvider'
import {
  formatAdminDateTime,
  getContactStatusLabel,
  type AdminContact,
} from '../../services/adminService'
import {
  CONTACT_STATUS_OPTIONS,
  fetchAdminContactById,
  isNewContactStatus,
  updateAdminContactStatus,
} from '../../services/adminContactsService'
import type { ContactRowStatus } from '../../types/database'

export function AdminContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()
  const [contact, setContact] = useState<AdminContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!id) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setLoading(true)
      const result = await fetchAdminContactById(id)
      if (!active) {
        return
      }

      if (!result.data) {
        setNotFound(true)
        setError(result.error)
        setContact(null)
        setLoading(false)
        return
      }

      setContact(result.data)
      setError(result.error)
      setNotFound(false)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [id])

  const handleStatusChange = async (status: ContactRowStatus) => {
    if (!contact || contact.status === 'local') {
      showToast(
        'Статус локальной заявки изменить нельзя. Подключите Supabase.',
        'error',
      )
      return
    }

    if (contact.status === status) {
      return
    }

    setSaving(true)
    const result = await updateAdminContactStatus(contact.id, status)
    setSaving(false)

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Не удалось обновить статус', 'error')
      return
    }

    setContact(result.data)
    showToast('Статус обновлён', 'success')
  }

  if (loading) {
    return <DataStatus loading loadingText="Загрузка заявки..." />
  }

  if (notFound || !contact) {
    return (
      <div className="space-y-4">
        <DataStatus error={error ?? 'Заявка не найдена'} />
        <Link
          to="/admin/contacts"
          className="inline-block text-sm text-muted transition-colors hover:text-ink"
        >
          ← К списку заявок
        </Link>
      </div>
    )
  }

  const isNew = isNewContactStatus(contact.status)
  const statusSelectValue =
    contact.status === 'local' ? 'new' : contact.status

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/admin/contacts"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            ← К списку заявок
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              {contact.name}
            </h1>
            {isNew ? (
              <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-surface">
                Новая
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            Карточка заявки · {formatAdminDateTime(contact.createdAt)}
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium text-muted"
            htmlFor="contact-status"
          >
            Статус
          </label>
          <select
            id="contact-status"
            className="min-w-[14rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink/30 disabled:opacity-60"
            value={statusSelectValue}
            disabled={saving || contact.status === 'local'}
            onChange={(event) =>
              void handleStatusChange(event.target.value as ContactRowStatus)
            }
          >
            {CONTACT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <DataStatus error={error} /> : null}

      <section
        className={`rounded-xl border border-border bg-surface ${
          isNew ? 'ring-1 ring-accent' : ''
        }`}
      >
        <dl className="divide-y divide-border">
          <DetailRow label="Имя" value={contact.name} />
          <DetailRow label="Компания" value={contact.company || '—'} />
          <DetailRow
            label="Email"
            value={
              contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  {contact.email}
                </a>
              ) : (
                '—'
              )
            }
          />
          <DetailRow
            label="Телефон / Telegram"
            value={contact.phone || '—'}
          />
          <DetailRow
            label="Тип проекта"
            value={contact.projectType || '—'}
          />
          <DetailRow
            label="Статус"
            value={getContactStatusLabel(contact.status)}
          />
          <DetailRow
            label="Дата"
            value={formatAdminDateTime(contact.createdAt)}
          />
          <div className="px-4 py-4 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-xs font-medium tracking-[0.04em] text-muted uppercase">
              Сообщение
            </dt>
            <dd className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink sm:mt-0">
              {contact.message}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="px-4 py-3 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-medium tracking-[0.04em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink sm:mt-0">{value}</dd>
    </div>
  )
}
