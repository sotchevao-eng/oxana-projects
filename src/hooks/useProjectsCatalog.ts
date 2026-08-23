import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Project } from '../types'
import type { ProjectFilterId, ProjectSortId } from '../types/filters'
import {
  fetchAllProjects,
  queryProjects,
} from '../services/projectsService'

const defaultFilter: ProjectFilterId = 'all'
const defaultSort: ProjectSortId = 'newest'

const validFilters = new Set<ProjectFilterId>([
  'all',
  'sites',
  'web-apps',
  'business',
  'games',
  'mobile',
  'ai-assistants',
  'bot',
])

function parseFilter(value: string | null): ProjectFilterId {
  if (value && validFilters.has(value as ProjectFilterId)) {
    return value as ProjectFilterId
  }
  return defaultFilter
}

export function useProjectsCatalog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterId, setFilterIdState] = useState<ProjectFilterId>(() =>
    parseFilter(searchParams.get('filter')),
  )
  const [sortId, setSortId] = useState<ProjectSortId>(defaultSort)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const next = parseFilter(searchParams.get('filter'))
    setFilterIdState(next)
  }, [searchParams])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const result = await fetchAllProjects()

      if (!active) {
        return
      }

      setAllProjects(result.data)
      setError(result.error)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const setFilterId = (id: ProjectFilterId) => {
    setFilterIdState(id)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id === defaultFilter) {
          next.delete('filter')
        } else {
          next.set('filter', id)
        }
        return next
      },
      { replace: true },
    )
  }

  const projects = queryProjects({
    filterId,
    search,
    sortId,
    items: allProjects,
  })

  const hasActiveFilters =
    filterId !== defaultFilter ||
    sortId !== defaultSort ||
    search.trim().length > 0

  const resetFilters = () => {
    setFilterId(defaultFilter)
    setSortId(defaultSort)
    setSearch('')
  }

  return {
    projects,
    loading,
    error,
    filterId,
    sortId,
    search,
    setFilterId,
    setSortId,
    setSearch,
    hasActiveFilters,
    resetFilters,
    totalCount: projects.length,
  }
}
