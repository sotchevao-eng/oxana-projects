import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { defaultSiteSettings } from '../data/siteSettings'
import {
  fetchSiteSettings,
  saveSiteSettings,
} from '../services/settingsService'
import type { SiteSettings, SiteSettingsFormValues } from '../types/siteSettings'

interface SiteSettingsContextValue {
  settings: SiteSettings
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (
    values: SiteSettingsFormValues,
  ) => Promise<{ ok: boolean; error?: string }>
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null)

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await fetchSiteSettings()
    setSettings(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (values: SiteSettingsFormValues) => {
    const result = await saveSiteSettings(values)
    if (result.ok && result.data) {
      setSettings(result.data)
      setError(null)
    }
    return { ok: result.ok, error: result.error }
  }, [])

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      refresh,
      save,
    }),
    [settings, loading, error, refresh, save],
  )

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export function useSiteSettings(): SiteSettingsContextValue {
  const context = useContext(SiteSettingsContext)
  if (!context) {
    throw new Error('useSiteSettings must be used within SiteSettingsProvider')
  }
  return context
}
