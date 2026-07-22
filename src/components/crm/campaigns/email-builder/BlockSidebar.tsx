import { Heading, Type, MousePointerClick, Image, Minus } from "@/components/icons"
import type { BlockType } from '../../../../../convex/emailBlocks'

interface BlockSidebarProps {
  onAdd: (type: BlockType) => void
}

const BLOCKS: { type: BlockType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { type: 'heading', label: 'Kop', Icon: Heading },
  { type: 'text', label: 'Tekst', Icon: Type },
  { type: 'button', label: 'Knop', Icon: MousePointerClick },
  { type: 'image', label: 'Afbeelding', Icon: Image },
  { type: 'divider', label: 'Divider', Icon: Minus },
]

export function BlockSidebar({ onAdd }: BlockSidebarProps) {
  return (
    <div className="flex w-[150px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Blokken
      </div>
      <div className="flex flex-col gap-1 p-2">
        {BLOCKS.map(({ type, label, Icon }) => (
          <button
            key={type}
            onClick={() => onAdd(type)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200"
          >
            <Icon size={15} className="shrink-0 text-zinc-500" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
