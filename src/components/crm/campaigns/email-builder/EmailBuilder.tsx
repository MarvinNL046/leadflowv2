import { useState } from 'react'
import type { EmailBlock, BlockType } from '../../../../../convex/emailBlocks'
import { createBlock } from '../../../../../convex/emailBlocks'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { BlockSidebar } from './BlockSidebar'
import { EmailCanvas } from './EmailCanvas'
import { PropertiesPanel } from './PropertiesPanel'

interface EmailBuilderProps {
  value: EmailBlock[]
  onChange: (blocks: EmailBlock[]) => void
  workspaceId: Id<'workspaces'>
}

export function EmailBuilder({ value, onChange, workspaceId }: EmailBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addBlock(type: BlockType) {
    const b = createBlock(type, crypto.randomUUID())
    onChange([...value, b])
    setSelectedId(b.id)
  }

  function updateBlock(id: string, props: Record<string, unknown>) {
    onChange(
      value.map((b) =>
        b.id === id
          ? ({ ...b, props: { ...b.props, ...props } } as EmailBlock)
          : b,
      ),
    )
  }

  function deleteBlock(id: string) {
    onChange(value.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = value.findIndex((b) => b.id === id)
    if (idx === -1) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= value.length) return
    const next = [...value]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    onChange(next)
  }

  return (
    <div className="flex min-h-[420px] overflow-hidden rounded-lg border border-zinc-200">
      <BlockSidebar onAdd={addBlock} />
      <EmailCanvas
        blocks={value}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={moveBlock}
        onDelete={deleteBlock}
      />
      <PropertiesPanel
        block={value.find((b) => b.id === selectedId) ?? null}
        onChange={(props) => { if (selectedId) updateBlock(selectedId, props) }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
