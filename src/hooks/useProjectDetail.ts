import { useEffect, useState } from 'react'
import type { Project } from '../types'
import {
  fetchProjectBySlug,
  fetchRelatedProjects,
} from '../services/projectsService'

export function useProjectDetail(slug: string | undefined) {
  const [project, setProject] = useState<Project | null>(null)
  const [relatedProjects, setRelatedProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!slug) {
        setProject(null)
        setRelatedProjects([])
        setNotFound(true)
        setLoading(false)
        return
      }

      setLoading(true)
      setNotFound(false)

      const [projectResult, relatedResult] = await Promise.all([
        fetchProjectBySlug(slug),
        fetchRelatedProjects(slug, 3),
      ])

      if (!active) {
        return
      }

      setProject(projectResult.data)
      setRelatedProjects(relatedResult.data)
      setError(projectResult.error ?? relatedResult.error)
      setNotFound(!projectResult.data)
      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [slug])

  return {
    project,
    relatedProjects,
    loading,
    error,
    notFound,
  }
}
