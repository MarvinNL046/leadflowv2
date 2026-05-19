import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '#/lib/utils.ts'

/**
 * Inline-editable tekst — click → input → Enter/blur saves, Esc cancels.
 *
 * `onSave` mag throwen of een rejected promise teruggeven; bij failure
 * tonen we de oude waarde weer en blijft de input open zodat de user kan
 * corrigeren. Toast/feedback laat ik aan de caller (die kent de domein-
 * specifieke foutmelding).
 */
export function InlineEditText({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  maxLength = 80,
  ariaLabel,
}: {
  value: string
  onSave: (next: string) => Promise<void> | void
  /** Styling van de niet-editing-weergave (h1/h3/etc. ouder). */
  className?: string
  /** Styling van de input wanneer in edit-mode. */
  inputClassName?: string
  placeholder?: string
  maxLength?: number
  ariaLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Sync draft als externe value wijzigt en we niet aan het editen zijn
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed === value || !trimmed) {
      setDraft(value)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Caller heeft toast getoond; blijf in edit-mode zodat user kan
      // corrigeren of escapen.
      setDraft(value)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        disabled={saving}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          'rounded border border-violet-400 bg-white px-1.5 py-0.5 outline-none ring-2 ring-violet-200 disabled:opacity-60',
          inputClassName ?? className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel ?? `${value} bewerken`}
      className={cn(
        'group inline-flex items-center gap-1 rounded px-1 -ml-1 hover:bg-zinc-100 text-left',
        className,
      )}
    >
      <span>{value}</span>
      <Pencil className="h-3 w-3 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
