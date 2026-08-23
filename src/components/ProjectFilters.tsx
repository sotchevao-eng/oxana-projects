import type { ProjectFilterId } from '../types/filters'
import { projectFilterOptions } from '../data/projectFilters'

interface ProjectFiltersProps {
  activeId: ProjectFilterId
  onChange: (id: ProjectFilterId) => void
}

export function ProjectFilters({ activeId, onChange }: ProjectFiltersProps) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Фильтры проектов"
    >
      {projectFilterOptions.map((option) => {
        const isActive = option.id === activeId

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={`chip-neon shrink-0 ${isActive ? 'chip-neon-active' : ''}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
