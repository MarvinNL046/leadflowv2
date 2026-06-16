import { useRef } from 'react'
import { useMutation } from 'convex/react'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import type { EmailBlock, Align } from '../../../../../convex/emailBlocks'

interface PropertiesPanelProps {
  block: EmailBlock | null
  onChange: (props: Record<string, unknown>) => void
  workspaceId: Id<'workspaces'>
}

// ── Shared align toggle ──────────────────────────────────────────────────────

function AlignToggle({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  const options: { a: Align; Icon: typeof AlignLeft }[] = [
    { a: 'left', Icon: AlignLeft },
    { a: 'center', Icon: AlignCenter },
    { a: 'right', Icon: AlignRight },
  ]
  return (
    <div className="flex gap-0.5 rounded border border-zinc-200 p-0.5">
      {options.map(({ a, Icon }) => (
        <button
          key={a}
          title={a}
          onClick={() => onChange(a)}
          className={[
            'flex flex-1 items-center justify-center rounded py-1',
            value === a ? 'bg-zinc-200' : 'hover:bg-zinc-100',
          ].join(' ')}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

// ── Per-type forms ───────────────────────────────────────────────────────────

function HeadingForm({ block, onChange }: { block: Extract<EmailBlock, { type: 'heading' }>; onChange: PropertiesPanelProps['onChange'] }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Tekst</Label>
        <Input
          value={block.props.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>
      <div>
        <Label className="mb-1">Uitlijning</Label>
        <AlignToggle value={block.props.align} onChange={(align) => onChange({ align })} />
      </div>
    </div>
  )
}

function TextForm({ block, onChange }: { block: Extract<EmailBlock, { type: 'text' }>; onChange: PropertiesPanelProps['onChange'] }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Inhoud</Label>
        <textarea
          value={block.props.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <div>
        <Label className="mb-1">Uitlijning</Label>
        <AlignToggle value={block.props.align} onChange={(align) => onChange({ align })} />
      </div>
    </div>
  )
}

function ButtonForm({ block, onChange }: { block: Extract<EmailBlock, { type: 'button' }>; onChange: PropertiesPanelProps['onChange'] }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Knoptekst</Label>
        <Input value={block.props.text} onChange={(e) => onChange({ text: e.target.value })} />
      </div>
      <div>
        <Label className="mb-1">URL</Label>
        <Input
          value={block.props.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://"
        />
        <p className="mt-0.5 text-xs text-zinc-400">Alleen http(s):// URLs worden als link gezet.</p>
      </div>
      <div>
        <Label className="mb-1">Uitlijning</Label>
        <AlignToggle value={block.props.align} onChange={(align) => onChange({ align })} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <Label className="mb-1">Achtergrondkleur</Label>
          <input
            type="color"
            value={block.props.bgColor}
            onChange={(e) => onChange({ bgColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-1"
          />
        </div>
        <div className="flex-1">
          <Label className="mb-1">Tekstkleur</Label>
          <input
            type="color"
            value={block.props.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-md border border-input p-1"
          />
        </div>
      </div>
    </div>
  )
}

function ImageForm({
  block,
  onChange,
  workspaceId,
}: {
  block: Extract<EmailBlock, { type: 'image' }>
  onChange: PropertiesPanelProps['onChange']
  workspaceId: Id<'workspaces'>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const resolveStorageUrl = useMutation(api.files.resolveStorageUrl)

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Afbeelding is groter dan 5 MB')
      return
    }
    try {
      const postUrl = await generateUploadUrl()
      const r = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!r.ok) throw new Error('Upload mislukt')
      const { storageId } = (await r.json()) as { storageId: string }
      const url = await resolveStorageUrl({ storageId: storageId as Id<'_storage'> })
      onChange({ src: url ?? '' })
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Upload mislukt'))
    }
  }

  // workspaceId is passed but we don't need to use it directly here since the
  // Convex mutation verifies auth server-side. It's available for future scope checks.
  void workspaceId

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Afbeelding uploaden</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-md border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          Afbeelding uploaden
        </button>
      </div>
      <div>
        <Label className="mb-1">Of plak een URL</Label>
        <Input
          value={block.props.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <div>
        <Label className="mb-1">Alt-tekst</Label>
        <Input
          value={block.props.alt}
          onChange={(e) => onChange({ alt: e.target.value })}
          placeholder="Beschrijving van de afbeelding"
        />
      </div>
      <div>
        <Label className="mb-1">Breedte ({block.props.width}%)</Label>
        <input
          type="range"
          min={10}
          max={100}
          value={block.props.width}
          onChange={(e) => onChange({ width: Number(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <Label className="mb-1">Uitlijning</Label>
        <AlignToggle value={block.props.align} onChange={(align) => onChange({ align })} />
      </div>
    </div>
  )
}

function DividerForm({ block, onChange }: { block: Extract<EmailBlock, { type: 'divider' }>; onChange: PropertiesPanelProps['onChange'] }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Kleur</Label>
        <input
          type="color"
          value={block.props.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-md border border-input p-1"
        />
      </div>
      <div>
        <Label className="mb-1">Dikte ({block.props.thickness}px)</Label>
        <input
          type="range"
          min={1}
          max={8}
          value={block.props.thickness}
          onChange={(e) => onChange({ thickness: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function PropertiesPanel({ block, onChange, workspaceId }: PropertiesPanelProps) {
  if (!block) {
    return (
      <div className="flex w-[280px] shrink-0 items-start border-l border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm text-zinc-400">Selecteer een blok om het aan te passen.</p>
      </div>
    )
  }

  const typeLabels: Record<EmailBlock['type'], string> = {
    heading: 'Kop',
    text: 'Tekst',
    button: 'Knop',
    image: 'Afbeelding',
    divider: 'Divider',
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {typeLabels[block.type]}
      </div>
      <div className="overflow-auto p-4">
        {block.type === 'heading' && (
          <HeadingForm block={block} onChange={onChange} />
        )}
        {block.type === 'text' && (
          <TextForm block={block} onChange={onChange} />
        )}
        {block.type === 'button' && (
          <ButtonForm block={block} onChange={onChange} />
        )}
        {block.type === 'image' && (
          <ImageForm block={block} onChange={onChange} workspaceId={workspaceId} />
        )}
        {block.type === 'divider' && (
          <DividerForm block={block} onChange={onChange} />
        )}
      </div>
    </div>
  )
}
