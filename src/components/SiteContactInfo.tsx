import { Code2, Mail, MessageCircle, Phone, Share2 } from 'lucide-react'
import { hasText } from '../data/siteSettings'
import {
  toGithubHref,
  toMailtoHref,
  toTelegramHref,
  toTelHref,
  toVkHref,
} from '../services/settingsService'
import type { SiteSettings } from '../types/siteSettings'

interface ContactItem {
  key: string
  label: string
  value: string
  href: string | null
  icon: typeof Mail
}

function buildContactItems(settings: SiteSettings): ContactItem[] {
  const items: ContactItem[] = []

  if (hasText(settings.email)) {
    items.push({
      key: 'email',
      label: 'Email',
      value: settings.email.trim(),
      href: toMailtoHref(settings.email),
      icon: Mail,
    })
  }

  if (hasText(settings.phone)) {
    items.push({
      key: 'phone',
      label: 'Телефон',
      value: settings.phone.trim(),
      href: toTelHref(settings.phone),
      icon: Phone,
    })
  }

  if (hasText(settings.telegram)) {
    items.push({
      key: 'telegram',
      label: 'Telegram',
      value: settings.telegram.trim(),
      href: toTelegramHref(settings.telegram),
      icon: MessageCircle,
    })
  }

  if (hasText(settings.vk)) {
    items.push({
      key: 'vk',
      label: 'VK',
      value: settings.vk.trim(),
      href: toVkHref(settings.vk),
      icon: Share2,
    })
  }

  if (hasText(settings.github)) {
    items.push({
      key: 'github',
      label: 'GitHub',
      value: settings.github.trim(),
      href: toGithubHref(settings.github),
      icon: Code2,
    })
  }

  return items
}

interface SiteContactInfoProps {
  settings: SiteSettings
  variant?: 'cards' | 'inline'
}

export function SiteContactInfo({
  settings,
  variant = 'cards',
}: SiteContactInfoProps) {
  const items = buildContactItems(settings)

  if (items.length === 0) {
    return null
  }

  if (variant === 'inline') {
    return (
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <li key={item.key}>
            {item.href ? (
              <a
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={
                  item.href.startsWith('http')
                    ? 'noreferrer noopener'
                    : undefined
                }
                className="text-sm text-muted transition-colors duration-300 hover:text-ink"
              >
                {item.label}
              </a>
            ) : (
              <span className="text-sm text-muted">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-5">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.key}
            className="rounded-[1.75rem] border border-border bg-surface p-6 md:p-8"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-soft text-ink">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{item.label}</p>
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={
                      item.href.startsWith('http')
                        ? 'noreferrer noopener'
                        : undefined
                    }
                    className="mt-1 block text-sm text-muted transition-colors duration-300 hover:text-ink"
                  >
                    {item.value}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-muted">{item.value}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
