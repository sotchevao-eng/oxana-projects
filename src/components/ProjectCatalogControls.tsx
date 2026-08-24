import { Search } from 'lucide-react'
import type { ProjectSortId } from '../types/filters'
import { projectSortOptions } from '../data/projectFilters'

interface ProjectCatalogControlsProps {
  search: string
  sortId: ProjectSortId
  onSearchChange: (value: string) => void
  onSortChange: (value: ProjectSortId) => void
}

export function ProjectCatalogControls({
  search,
  sortId,
  onSearchChange,
  onSortChange,
}: ProjectCatalogControlsProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Поиск проектов</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск проектов"
          className="w-full rounded-2xl border border-border bg-surface py-3.5 pr-4 pl-11 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)]"
        />
      </label>

      <label className="relative w-full md:w-56">
        <span className="sr-only">Сортировка</span>
        <select
          value={sortId}
          onChange={(event) =>
            onSortChange(event.target.value as ProjectSortId)
          }
          className="w-full appearance-none rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-300 focus:border-accent/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_18%,transparent)]"
        >
          {projectSortOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
