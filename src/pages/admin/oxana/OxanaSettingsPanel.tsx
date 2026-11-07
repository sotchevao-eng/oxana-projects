import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { DataStatus } from '../../../components/DataStatus'
import { useToast } from '../../../components/ToastProvider'
import { useTheme } from '../../../hooks/useTheme'
import {
  fetchOxanaGigachatModels,
  fetchOxanaSettings,
  fetchOxanaStatus,
  updateOxanaSettings,
  type OxanaGigachatModelsDiag,
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
  const [checkingModels, setCheckingModels] = useState(false)
  const [modelsDiag, setModelsDiag] = useState<OxanaGigachatModelsDiag | null>(
    null,
  )

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

  const handleCheckModels = async () => {
    if (!token || checkingModels) {
      return
    }
    setCheckingModels(true)
    const result = await fetchOxanaGigachatModels(token)
    setModelsDiag(result)
    setCheckingModels(false)
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Настройки ОКСИ</h2>
        <p className="mt-1 text-sm text-muted">
          Секреты, пароли и строки подключения здесь не показываются.
        </p>
      </div>

      <DataStatus
        loading={loading}
        error={error}
        loadingText="Загрузка настроек..."
      />
      {error ? (
        <Button type="button" variant="secondary" onClick={() => void reload()}>
          Повторить
        </Button>
      ) : null}

      {settings ? (
        <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Отображаемое имя</span>
            <input
              className={OXANA_FIELD_CLASS}
              value={settings.displayName}
              onChange={(event) => patch({ displayName: event.target.value })}
              maxLength={80}
            />
          </label>
          <label className="block space-y-1.5">
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
          <label className="block space-y-1.5">
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
          <label className="block space-y-1.5">
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

          <fieldset className="space-y-2 rounded-lg border border-border px-3 py-3">
            <legend className="px-1 text-xs font-medium text-muted">
              Виды уведомлений
            </legend>
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
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
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
            <label className="block space-y-1.5">
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

          <Button type="submit" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </form>
      ) : null}

      <div className="space-y-3 rounded-lg border border-dashed border-border px-3 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Проверить модели GigaChat
          </h3>
          <p className="mt-1 text-xs text-muted">
            Временная диагностика. Показывает только статус и идентификаторы
            моделей. Ответ не сохраняется.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={checkingModels || !token}
          onClick={() => void handleCheckModels()}
        >
          {checkingModels ? 'Проверка...' : 'Проверить модели GigaChat'}
        </Button>
        {modelsDiag ? <GigachatModelsDiagResult result={modelsDiag} /> : null}
      </div>

      {status ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
    <div className="rounded-lg border border-border px-3 py-3">
      <dt className="text-xs text-muted">{title}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  )
}

function GigachatModelsDiagResult({
  result,
}: {
  result: OxanaGigachatModelsDiag
}) {
  const statusLabel =
    result.status === null ? 'сеть' : String(result.status)
  const modelsLabel =
    result.models.length > 0 ? result.models.join(', ') : 'нет'
  const hint =
    result.status === null
      ? 'Сеть недоступна. Повторите проверку.'
      : result.status === 401
        ? 'Нужно войти в админку заново.'
        : result.status === 403
          ? 'Для ОКСИ нет права доступа.'
          : result.status === 404
            ? 'Диагностика моделей сейчас недоступна.'
            : result.status >= 500
              ? 'Сервис GigaChat недоступен.'
              : null

  return (
    <div className="space-y-1 text-sm text-ink" role="status">
      <p>Статус: {statusLabel}</p>
      <p>Модели: {modelsLabel}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
