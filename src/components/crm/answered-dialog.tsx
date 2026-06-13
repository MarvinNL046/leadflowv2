import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  CalendarClock,
  PhoneOutgoing,
  XCircle,
  Send,
  ArrowLeft,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { toLocalDatetimeInputValue } from '#/lib/datetime.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

interface Props {
  contactId: Id<'contacts'>
  contactName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type View = 'main' | 'appointment' | 'callback'

export function AnsweredDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: Props) {
  const recordAnswered = useMutation(api.contacts.recordCallAnswered)
  const [view, setView] = useState<View>('main')
  const [submitting, setSubmitting] = useState(false)

  // Appointment form state
  const [appointmentDate, setAppointmentDate] = useState(() => {
    // Default: morgen 10:00
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return toLocalDatetimeInputValue(d)
  })
  const [appointmentNote, setAppointmentNote] = useState('')

  // Callback form state
  const [callbackDays, setCallbackDays] = useState<7 | 30 | 90 | 180>(7)
  const [callbackNote, setCallbackNote] = useState('')

  function reset() {
    setView('main')
    setAppointmentNote('')
    setCallbackNote('')
    setCallbackDays(7)
    onOpenChange(false)
  }

  async function handleOutcome(
    outcome: 'appointment' | 'callback' | 'not_interested',
    extras: { followUpAt?: number; note?: string } = {},
  ) {
    if (submitting) return
    setSubmitting(true)
    try {
      await recordAnswered({
        contactId,
        outcome,
        followUpAt: extras.followUpAt,
        note: extras.note,
      })
      toast.success(
        outcome === 'appointment'
          ? 'Afspraak ingepland — in agenda + lead naar Voorstel-stage'
          : outcome === 'callback'
            ? 'Terugbel-datum gezet'
            : 'Lead gemarkeerd als niet geïnteresseerd',
      )
      reset()
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Mislukt'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : reset())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {view !== 'main' && (
            <button
              type="button"
              onClick={() => setView('main')}
              className="mb-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
            >
              <ArrowLeft className="h-3 w-3" /> terug
            </button>
          )}
          <DialogTitle className="flex items-center gap-2">
            ✅ Heeft opgenomen
          </DialogTitle>
          <DialogDescription>
            Naar <span className="font-medium">{contactName}</span> —
            wat is de uitkomst?
          </DialogDescription>
        </DialogHeader>

        {view === 'main' && (
          <div className="space-y-2">
            <OutcomeButton
              icon={CalendarClock}
              label="Afspraak ingepland"
              desc="Lead naar Voorstel-stage, datum kiezen"
              color="violet"
              onClick={() => setView('appointment')}
            />
            <OutcomeButton
              icon={PhoneOutgoing}
              label="Terugbellen"
              desc="Lead blijft Lead-stage, follow-up in N dagen"
              color="blue"
              onClick={() => setView('callback')}
            />
            <OutcomeButton
              icon={XCircle}
              label="Niet geïnteresseerd"
              desc="Lead naar Verloren-stage, uit dashboard"
              color="zinc"
              onClick={() => handleOutcome('not_interested')}
              disabled={submitting}
            />
          </div>
        )}

        {view === 'appointment' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleOutcome('appointment', {
                followUpAt: new Date(appointmentDate).getTime(),
                note: appointmentNote || undefined,
              })
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="appt-date">Wanneer?</Label>
              <Input
                id="appt-date"
                type="datetime-local"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appt-note">Notitie (optioneel)</Label>
              <textarea
                id="appt-note"
                value={appointmentNote}
                onChange={(e) => setAppointmentNote(e.target.value)}
                placeholder="Bv. adres bezoek, type airco, etc."
                rows={3}
                className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Inplannen…' : 'Afspraak inplannen'}
            </Button>
          </form>
        )}

        {view === 'callback' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleOutcome('callback', {
                followUpAt:
                  Date.now() + callbackDays * 24 * 60 * 60 * 1000,
                note: callbackNote || undefined,
              })
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>Wanneer terugbellen?</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {([7, 30, 90, 180] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCallbackDays(d)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      callbackDays === d
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-note">Notitie (optioneel)</Label>
              <textarea
                id="cb-note"
                value={callbackNote}
                onChange={(e) => setCallbackNote(e.target.value)}
                placeholder="Bv. wil eerst overleggen met partner"
                rows={2}
                className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-600 to-sky-600 text-white"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Opslaan…' : `Terugbellen over ${callbackDays} dagen`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OutcomeButton({
  icon: Icon,
  label,
  desc,
  color,
  onClick,
  disabled = false,
}: {
  icon: typeof CalendarClock
  label: string
  desc: string
  color: 'violet' | 'blue' | 'zinc'
  onClick: () => void
  disabled?: boolean
}) {
  const colors = {
    violet:
      'border-violet-200 hover:border-violet-400 hover:bg-violet-50 text-violet-700',
    blue: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700',
    zinc: 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 text-zinc-700',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        colors[color],
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
      </div>
    </button>
  )
}
