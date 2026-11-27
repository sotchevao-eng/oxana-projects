import { useState } from 'react'
import { CalendarDays, FileText, Megaphone, ShieldCheck, Users, Wallet, Radar, ClipboardCheck } from 'lucide-react'

const sections = [
  { title: 'Сообщества', icon: Users, description: 'Настройки групп и редакционная политика' },
  { title: 'Контент-план', icon: CalendarDays, description: 'Календарь будущих публикаций' },
  { title: 'Черновики', icon: FileText, description: 'Подготовка и редактирование контента' },
  { title: 'Источники', icon: Radar, description: 'Мониторинг и проверка информации' },
  { title: 'Согласование', icon: ClipboardCheck, description: 'Ручное утверждение каждой версии' },
  { title: 'Бюджет', icon: Wallet, description: 'Лимиты и расходы на генерацию' },
]

export function AdminSmmPage() {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <section className="space-y-6">
      <header className="flex items-center gap-3">
        <Megaphone className="h-8 w-8 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold text-ink">OXANA SMM</h1>
          <p className="text-sm text-muted">Центр управления контентом · версия 0.1</p>
        </div>
      </header>
      <div className="flex gap-3 rounded-2xl border border-border bg-surface p-4" role="status">
        <ShieldCheck className="h-6 w-6 shrink-0" />
        <div>
          <p className="font-medium text-ink">Публикации отключены</p>
          <p className="text-sm text-muted">Демонстрационный интерфейс. Нет подключения к VK, MAX, ИИ или базе данных. Никакие данные не отправляются и не сохраняются.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map(({ title, icon: Icon, description }) => (
          <button key={title} type="button" aria-pressed={selected === title}
            onClick={() => setSelected(title)}
            className="rounded-2xl border border-border bg-surface p-5 text-left transition-colors hover:bg-soft focus-visible:outline focus-visible:outline-2">
            <Icon className="mb-3 h-6 w-6" />
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-2xl border border-border bg-surface p-5" aria-live="polite">
          <h2 className="font-semibold text-ink">{selected}</h2>
          <p className="mt-2 text-sm text-muted">Раздел запланирован. Рабочие функции будут доступны после подключения серверной части.</p>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-ink">Мои сообщества</h2>
        <p className="mt-2 text-sm text-muted">Сообщества ещё не подключены. Настройки будут храниться в защищённой серверной базе.</p>
      </div>
    </section>
  )
}
