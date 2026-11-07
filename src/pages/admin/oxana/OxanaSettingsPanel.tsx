import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import { useTheme } from '../../../hooks/useTheme'
import {
  fetchOxanaSettings,
  fetchOxanaStatus,
  updateOxanaSettings,
} from '../../../services/oxanaService'
import type { OxanaOwnerSettings, OxanaStatus } from '../../../types/oxana'
import { OXANA_TIMEZONES } from '../../../utils/oxanaTime'
import { OXANA_FIELD_CLASS } from './oxanaUi'

interface Props {
  token: string
  authLoading: boolean
  onSettingsChange: (settings: OxanaOwnerSettings) => void
}

export function OxanaSettingsPanel({
  token,
  authLoading,
  onSettingsChange,
}: Props) {
  const { showToast } = useToast()
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<OxanaOwnerSettings | null>(null)
  const [status, setStatus] = useState<OxanaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (authLoading) return
    if (!token) {
      setLoading(false)
      setError('Сессия ещё не готова. Обновите страницу после входа.')
      return
    }
    setLoading(true)
    const [settingsResult, statusResult] = await Promise.all([
      fetchOxanaSettings(token),
      fetchOxanaStatus(token),
    ])
    if (settingsResult.ok) {
      setSettings(settingsResult.data.settings)
      onSettingsChange(settingsResult.data.settings)
      setError(null)
    } else {
      setSettings(null)
      setError(settingsResult.error)
    }
    if (statusResult.ok) {
      setStatus(statusResult.data)
    }
    setLoading(false)
  }, [authLoading, onSettingsChange, token])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings || saving) return
    setSaving(true)
    const result = await updateOxanaSettings(token, settings)
    setSaving(false)
    if (!result.ok) {
      showToast(result.error, 'error')
      return
    }
    setSettings(result.data.settings)
    onSettingsChange(result.data.settings)
    showToast('Настройки сохранены', 'success')
  }

  const patch = (partial: Partial<OxanaOwnerSettings>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
  }

  return (
    <section className="space-y-3 rounded-[1.125rem] border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Настройки ОКСИ</h2>
        <p className="mt-0.5 text-xs text-muted">
          Секреты, пароли и строки подключения здесь не показываются.
        </p>
      </div>

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка настроек..."
      />
      {error ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => void reload()}>
          Повторить
        </Button>
      ) : null}

      {settings ? (
        <form className="space-y-3" onSubmit={(event) => void handleSave(event)}>
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
              Профиль
            </h3>
            <div className="grid gap-2.5 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">Отображаемое имя</span>
                <input
                  className={OXANA_FIELD_CLASS}
                  value={settings.displayName}
                  onChange={(event) => patch({ displayName: event.target.value })}
                  maxLength={80}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">Часовой пояс</span>
                <select
                  className={OXANA_FIELD_CLASS}
                  value={settings.timezone}
                  onChange={(event) => patch({ timezone: event.target.value })}
                >
                  {OXANA_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">Формат даты</span>
                <select
                  className={OXANA_FIELD_CLASS}
                  value={settings.dateFormat}
                  onChange={(event) =>
                    patch({ dateFormat: event.target.value as 'date' | 'datetime' })
                  }
                >
                  <option value="datetime">Дата и время</option>
                  <option value="date">Только дата</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">Тема</span>
                <select
                  className={OXANA_FIELD_CLASS}
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
                >
                  <option value="light">Светлая</option>
                  <option value="dark">Тёмная</option>
                </select>
              </label>
            </div>
          </section>

          <fieldset className="space-y-1.5 rounded-xl border border-border px-3 py-2.5">
            <legend className="px-1 text-xs font-medium text-muted">
              Виды уведомлений
            </legend>
            <div className="grid gap-1.5 md:grid-cols-2">
              <Toggle
                label="За сутки до срока задачи"
                checked={settings.notifyTaskDueSoon}
                onChange={(checked) => patch({ notifyTaskDueSoon: checked })}
              />
              <Toggle
                label="В день выполнения задачи"
                checked={settings.notifyTaskDueDay}
                onChange={(checked) => patch({ notifyTaskDueDay: checked })}
              />
              <Toggle
                label="При наступлении просрочки"
                checked={settings.notifyTaskOverdue}
                onChange={(checked) => patch({ notifyTaskOverdue: checked })}
              />
              <Toggle
                label="Перед началом события"
                checked={settings.notifyEvent}
                onChange={(checked) => patch({ notifyEvent: checked })}
              />
            </div>
          </fieldset>

          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
              Напоминания
            </h3>
            <div className="grid gap-2.5 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">
                  За сколько часов напоминать о задаче
                </span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  className={OXANA_FIELD_CLASS}
                  value={settings.taskSoonHours}
                  onChange={(event) =>
                    patch({ taskSoonHours: Number(event.target.value) })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted">
                  За сколько минут напоминать о событии
                </span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  className={OXANA_FIELD_CLASS}
                  value={settings.eventSoonMinutes}
                  onChange={(event) =>
                    patch({ eventSoonMinutes: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          </section>

          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </form>
      ) : null}

      {status ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
            Система
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-3">
            <StatusCard title="Контур" value={status.workspace.name} />
            <StatusCard
              title="PostgreSQL"
              value={status.database?.connected ? 'Подключена' : 'Нет соединения'}
            />
            <StatusCard title="API ОКСИ" value={status.api?.ready ? 'Готов' : 'Не готов'} />
            <StatusCard
              title="ИИ"
              value={
                status.ai.ready
                  ? `${status.ai.provider} · готов`
                  : `${status.ai.provider} · не подключён`
              }
            />
            <StatusCard
              title="Telegram"
              value={status.channels.telegram ? 'Подключён' : 'Не активирован'}
            />
            <StatusCard
              title="MAX"
              value={status.channels.max ? 'Подключён' : 'Не активирован'}
            />
          </dl>
        </section>
      ) : null}
    </section>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-ink">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex h-full min-h-[4.25rem] flex-col justify-center rounded-xl border border-border px-3 py-2.5">
      <dt className="text-[11px] text-muted">{title}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink">{value}</dd>
    </div>
  )
}
