import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-[0_0_12px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)] transition-all duration-300 hover:border-accent/60 hover:bg-soft hover:shadow-[0_0_18px_color-mix(in_srgb,var(--theme-accent)_28%,transparent)] ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  )
}
