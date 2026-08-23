import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataStatus } from '../../components/DataStatus'
import {
  formatAdminDate,
  getContactStatusLabel,
  type AdminContact,
} from '../../services/adminService'
import {
  CONTACT_STATUS_OPTIONS,
  fetchAdminContacts,
  getContactDisplayValue,
  isNewContactStatus,
  matchesContactStatusFilter,
  type AdminContactStatusFilter,
} from '../../services/adminContactsService'

const filterOptions: Array<{
  value: AdminContactStatusFilter
  label: string
}> = [{ value: 'all', label: 'Все' }, ...CONTACT_STATUS_OPTIONS]

export function AdminContactsPage() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<AdminContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] =
    useState<AdminContactStatusFilter>('all')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const result = await fetchAdminContacts()
      if (!active) {
        return
      }

      setContacts(result.data)
      setError(result.error)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(
    () =>
      contacts.filter((contact) =>
        matchesContactStatusFilter(contact, statusFilter),
      ),
    [contacts, statusFilter],
  )

  const newCount = contacts.filter((contact) =>
    isNewContactStatus(contact.status),
  ).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Заявки
          </h1>
          <p className="mt-1 text-sm text-muted">
            Обращения с формы контактов
            {newCount > 0 ? ` · новых: ${newCount}` : ''}.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium text-muted"
            htmlFor="contact-status-filter"
          >
            Статус
          </label>
          <select
            id="contact-status-filter"
            className="min-w-[12rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as AdminContactStatusFilter)
            }
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка заявок..."
      />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-soft/60 text-xs tracking-[0.06em] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Компания</th>
                <th className="px-4 py-3 font-medium">Контакт</th>
                <th className="px-4 py-3 font-medium">Тип проекта</th>
                <th className="px-4 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-muted">
                    {contacts.length === 0
                      ? 'Заявок пока нет'
                      : 'Нет заявок с выбранным статусом'}
                  </td>
                </tr>
              ) : (
                filtered.map((contact) => {
                  const isNew = isNewContactStatus(contact.status)

                  return (
                    <tr
                      key={contact.id}
                      className={`cursor-pointer align-top transition-colors hover:bg-soft/50 ${
                        isNew ? 'bg-accent/25' : ''
                      }`}
                      onClick={() =>
                        navigate(`/admin/contacts/${contact.id}`)
                      }
                    >
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {formatAdminDate(contact.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isNew ? (
                            <span
                              className="inline-block size-1.5 shrink-0 rounded-full bg-ink"
                              aria-hidden
                            />
                          ) : null}
                          <span
                            className={
                              isNew ? 'font-semibold text-ink' : 'font-medium text-ink'
                            }
                          >
                            {contact.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {contact.company || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {getContactDisplayValue(contact)}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {contact.projectType || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            isNew
                              ? 'inline-flex rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-surface'
                              : 'text-muted'
                          }
                        >
                          {getContactStatusLabel(contact.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && filtered.length > 0 ? (
        <p className="text-xs text-muted">
          Показано {filtered.length} из {contacts.length}. Нажмите на строку,
          чтобы открыть карточку.{' '}
          <Link to="/admin" className="underline-offset-2 hover:underline">
            На дашборд
          </Link>
        </p>
      ) : null}
    </div>
  )
}
