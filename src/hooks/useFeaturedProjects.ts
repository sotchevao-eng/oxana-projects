import { useEffect, useState } from 'react'
import type { Project } from '../types'
import { fetchFeaturedProjects } from '../services/projectsService'

export function useFeaturedProjects(limit = 6) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const result = await fetchFeaturedProjects(limit)

      if (!active) {
        return
      }

      setProjects(result.data)
      setError(result.error)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [limit])

  return { projects, loading, error }
}
