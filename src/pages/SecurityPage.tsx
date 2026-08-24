import { LegalDocumentPage } from '../components/LegalDocumentPage'
import { securityPageMeta, securitySections } from '../data/legal'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSiteSettings } from '../hooks/useSiteSettings'

export function SecurityPage() {
  const { settings } = useSiteSettings()

  usePageMeta({
    title: securityPageMeta.title,
    description: securityPageMeta.description,
  })

  return (
    <LegalDocumentPage
      eyebrow="Документы"
      title={securityPageMeta.title}
      updatedAt="24.08.2026"
      intro={`Раздел о мерах безопасности сайта ${settings.siteName}: доступ к админ-панели, хранение данных, cookies и рекомендации для пользователей.`}
      sections={securitySections}
      relatedLinks={[
        { label: 'Политика конфиденциальности', to: '/privacy' },
        { label: 'Контакты', to: '/contacts' },
      ]}
    />
  )
}
