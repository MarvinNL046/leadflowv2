import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'

interface Props {
  processing: string | null
  onSubmit: (followUpAt: number) => void
}

/**
 * Datum-stap voor "Afspraak nu inplannen" — zonder datum geen afspraak:
 * de gekozen datum/tijd gaat de note in én wordt als adviesgesprek-event
 * in de Google-agenda gezet.
 */
export function AppointmentDateView({ processing, onSubmit }: Props) {
  const [appointmentDate, setAppointmentDate] = useState(() => {
    // Default: morgen 10:00
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new Date(appointmentDate).getTime())
      }}
      className="space-y-3 pt-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor="lead-appt-date">Wanneer is de afspraak?</Label>
        <Input
          id="lead-appt-date"
          type="datetime-local"
          value={appointmentDate}
          onChange={(e) => setAppointmentDate(e.target.value)}
          required
        />
        <p className="text-xs text-zinc-500">
          Wordt automatisch als adviesgesprek in de Google-agenda gezet.
        </p>
      </div>
      <Button
        type="submit"
        disabled={processing !== null}
        className="w-full bg-gradient-to-r from-violet-600 to-blue-600 text-white"
      >
        <Send className="h-4 w-4" />
        {processing !== null ? 'Inplannen…' : 'Afspraak inplannen'}
      </Button>
    </form>
  )
}
