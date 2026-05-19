import { Info } from 'lucide-react'

const COLOR_STYLES = {
  orange:
    'border-orange-200 text-orange-700 hover:bg-orange-50 [&_svg]:text-orange-500',
  green: 'bg-green-600 text-white hover:bg-green-700 [&_svg]:text-white',
  amber:
    'border-amber-200 text-amber-700 hover:bg-amber-50 [&_svg]:text-amber-500',
  red: 'border-red-200 text-red-700 hover:bg-red-50 [&_svg]:text-red-500',
  violet:
    'bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700 [&_svg]:text-white',
  blue: 'border-blue-200 text-blue-700 hover:bg-blue-50 [&_svg]:text-blue-500',
  zinc: 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 [&_svg]:text-zinc-500',
} as const

export type ActionButtonColor = keyof typeof COLOR_STYLES

/**
 * Knop met titel + uitleg-subtitle, gebruikt in alle sub-views voor
 * een consistente "wat doet deze knop" affordance.
 */
export function ActionButton({
  icon: Icon,
  title,
  subtitle,
  color,
  primary = false,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  color: ActionButtonColor
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? '' : 'bg-white'
      } ${COLOR_STYLES[color]}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p
          className={`mt-0.5 text-xs ${primary ? 'opacity-90' : 'opacity-70'}`}
        >
          {subtitle}
        </p>
      </div>
      <Info className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
    </button>
  )
}
