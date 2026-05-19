import { Clock } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'

interface Props {
  processing: string | null
  onPick: (days: number) => void
}

const PRESETS = [
  { days: 1, label: 'Morgen' },
  { days: 3, label: 'Over 3 dagen' },
  { days: 7, label: 'Over een week' },
  { days: 14, label: 'Over 2 weken' },
  { days: 30, label: 'Over een maand' },
]

export function CallbackOptionsView({ processing, onPick }: Props) {
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-center text-sm font-medium text-zinc-600">
        Wanneer terugbellen?
      </p>
      {PRESETS.map((p) => (
        <Button
          key={p.days}
          type="button"
          variant="outline"
          disabled={processing !== null}
          onClick={() => onPick(p.days)}
          className="h-12 justify-between border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-semibold">{p.label}</span>
          </span>
          <span className="text-xs opacity-60">
            {p.days} {p.days === 1 ? 'dag' : 'dagen'}
          </span>
        </Button>
      ))}
    </div>
  )
}
