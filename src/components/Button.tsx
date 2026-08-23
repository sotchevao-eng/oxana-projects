import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'lg'

interface ButtonProps {
  children: ReactNode
  to?: string
  href?: string
  type?: 'button' | 'submit'
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  onClick?: () => void
  external?: boolean
  disabled?: boolean
}

const baseClasses =
  'inline-flex items-center justify-center rounded-2xl font-semibold tracking-tight transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'btn-primary-volume bg-brand-gradient text-white hover:brightness-115 hover:-translate-y-1 active:translate-y-0 active:brightness-95',
  secondary:
    'btn-secondary-volume bg-surface text-ink border-2 border-accent/35 hover:border-accent hover:bg-soft hover:-translate-y-1 active:translate-y-0',
  ghost: 'bg-transparent text-ink hover:bg-soft',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'px-5 py-3 text-sm',
  lg: 'px-7 py-4 text-base',
}

export function Button({
  children,
  to,
  href,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  onClick,
  external = false,
  disabled = false,
}: ButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${
    disabled ? 'pointer-events-none opacity-60' : ''
  }`

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {children}
      </Link>
    )
  }

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        onClick={onClick}
        {...(external
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {children}
      </a>
    )
  }

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
