import { useId, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export function ContactTasks({ contactId, workspaceId }: { contactId: Id<'contacts'>; workspaceId: Id<'workspaces'> }) {
  const tasks = useQuery(api.tasks.listByContact, { contactId })
  const members = useQuery(api.tasks.assignees, { workspaceId })
  const assign = useMutation(api.tasks.assign)
  const create = useMutation(api.tasks.create)
  const setDone = useMutation(api.tasks.setDone)
  const prefix = useId()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [assignedToId, setAssignedToId] = useState('')

  async function reassign(taskId: Id<'tasks'>, value: string) {
    if (busy.current) return
    busy.current = true; setPending(true)
    try { await assign({ taskId, userId: value ? value as Id<'users'> : null }) }
    catch (error) { toast.error(humanizeConvexError(error, 'Toewijzen is niet gelukt')) }
    finally { busy.current = false; setPending(false) }
  }
  function options(current?: string) {
    return <><option value="">Niet toegewezen</option>{current && members && !members.some(m => m.userId === current) && <option value={current} disabled>Voormalig teamlid</option>}{members?.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}</>
  }

  async function save() {
    if (busy.current || !title.trim()) return
    busy.current = true
    setPending(true)
    try {
      await create({ contactId, title: title.trim(), description,
        assignedToId: assignedToId ? assignedToId as Id<'users'> : undefined,
        dueDate: date ? new Date(`${date}T09:00:00`).getTime() : undefined })
      setTitle(''); setDescription(''); setDate('')
      toast.success('Opvolgtaak opgeslagen')
    } catch (error) {
      toast.error(humanizeConvexError(error, 'Taak opslaan is niet gelukt'))
    } finally { busy.current = false; setPending(false) }
  }

  async function toggle(taskId: Id<'tasks'>, done: boolean) {
    if (busy.current) return
    busy.current = true; setPending(true)
    try { await setDone({ taskId, done }) }
    catch (error) { toast.error(humanizeConvexError(error, 'Taak bijwerken is niet gelukt')) }
    finally { busy.current = false; setPending(false) }
  }

  return <Card id="opvolging">
    <CardHeader><CardTitle>Opvolging</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Controleer de afspraakstatus voordat je een nieuwe opvolgtaak maakt. Een afgeronde taak verandert de verkoopfase niet.</p>
      {tasks === undefined ? <Skeleton className="h-20 w-full" /> : <>
        {tasks.length === 0 && <p className="text-sm">Geen taken geregistreerd bij dit contact. Dit betekent niet dat er al een afspraak is.</p>}
        <ul className="space-y-3">{tasks.map(task => <li key={task._id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-medium">{task.title}</p><p className="text-sm text-muted-foreground">{task.status === 'open' ? 'Open' : 'Afgerond'} · {task.dueDate ? `Uiterlijk ${new Date(task.dueDate).toLocaleDateString('nl-NL')}` : 'Geen deadline'}</p></div>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => void toggle(task._id, task.status === 'open')}>{task.status === 'open' ? 'Afronden' : 'Heropenen'}</Button>
          </div>
          {task.description && <p className="mt-2 whitespace-pre-line text-sm">{task.description}</p>}
          <label className="mt-2 block text-sm">Verantwoordelijke voor {task.title}<select className="mt-1 block w-full rounded-md border bg-background p-2" value={task.assignedToId ?? ''} disabled={pending || !members} onChange={event => void reassign(task._id, event.target.value)}>{options(task.assignedToId)}</select></label>
        </li>)}</ul>
        {tasks.length === 50 && <p className="text-sm text-muted-foreground">De 50 recentste taken worden getoond. Bekijk ook de open takenlijst.</p>}
      </>}
      <a href="/crm/taken" className="inline-block text-sm text-primary underline">Alle open taken van je bedrijf</a>
      <form className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <Label htmlFor={`${prefix}-title`}>Nieuwe opvolgtaak</Label>
        <Input id={`${prefix}-title`} required maxLength={200} value={title} disabled={pending} onChange={event => setTitle(event.target.value)} placeholder="Bijvoorbeeld: afspraakstatus controleren" />
        <Label htmlFor={`${prefix}-description`}>Toelichting en verantwoordelijke</Label>
        <textarea id={`${prefix}-description`} className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" maxLength={4000} value={description} disabled={pending} onChange={event => setDescription(event.target.value)} placeholder="Wie pakt dit op en wat is de volgende handeling?" />
        <Label htmlFor={`${prefix}-assignee`}>Toewijzen aan</Label>
        <select id={`${prefix}-assignee`} className="block w-full rounded-md border bg-background p-2" value={assignedToId} disabled={pending || !members} onChange={event => setAssignedToId(event.target.value)}>{options()}</select>
        <Label htmlFor={`${prefix}-date`}>Uiterste datum (optioneel)</Label>
        <Input id={`${prefix}-date`} type="date" value={date} disabled={pending} onChange={event => setDate(event.target.value)} />
        <Button type="submit" disabled={pending || tasks === undefined || !title.trim()}>{pending ? 'Bezig…' : 'Taak opslaan'}</Button>
      </form>
    </CardContent>
  </Card>
}
