import { useEffect } from 'react'
import { useSiteSettings } from './useSiteSettings'

interface PageMetaOptions {
  title?: string | null
  description?: string | null
}

function upsertMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export function usePageMeta({ title, description }: PageMetaOptions) {
  const { settings } = useSiteSettings()

  useEffect(() => {
    const site = settings.siteName || 'OXANA PROJECTS'
    const nextTitle = title?.trim()
      ? title.includes(site)
        ? title.trim()
        : `${title.trim()} · ${site}`
      : site

    document.title = nextTitle

    if (description?.trim()) {
      upsertMeta('description', description.trim())
    } else if (settings.description.trim()) {
      upsertMeta('description', settings.description.trim())
    }
  }, [title, description, settings.siteName, settings.description])
}
