import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Включить красную тему' : 'Включить синюю тему'}
      title={isDark ? 'Красная тема' : 'Синяя тема'}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-accent/50 text-ink shadow-[0_0_12px_color-mix(in_srgb,var(--theme-accent)_35%,transparent)] transition-colors duration-300 hover:border-accent hover:bg-soft ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  )
}
