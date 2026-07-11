import { ChevronUp, ChevronDown, Trash2 } from "@/components/icons"
import type { EmailBlock } from '../../../../../convex/emailBlocks'
import { renderBlockToHtml } from '../../../../../convex/emailBlocks'

interface EmailCanvasProps {
  blocks: EmailBlock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, dir: -1 | 1) => void
  onDelete: (id: string) => void
}

export function EmailCanvas({ blocks, selectedId, onSelect, onMove, onDelete }: EmailCanvasProps) {
  return (
    <div
      className="flex flex-1 overflow-auto bg-zinc-100 p-4"
      onClick={() => onSelect(null)}
    >
      <div className="mx-auto w-full max-w-[600px] rounded-lg bg-white px-6 py-6 shadow-sm">
        {blocks.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">
            Voeg links een blok toe om te beginnen.
          </p>
        ) : (
          blocks.map((block, idx) => {
            const isSelected = selectedId === block.id
            return (
              <div
                key={block.id}
                onClick={(e) => { e.stopPropagation(); onSelect(block.id) }}
                className={[
                  'relative cursor-pointer rounded p-1',
                  isSelected
                    ? 'ring-2 ring-violet-500'
                    : 'hover:ring-1 hover:ring-zinc-300',
                ].join(' ')}
              >
                {/* Floating toolbar when selected */}
                {isSelected && (
                  <div
                    className="absolute -top-7 right-0 z-10 flex items-center gap-0.5 rounded border border-zinc-200 bg-white px-1 py-0.5 shadow-md"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      title="Omhoog"
                      disabled={idx === 0}
                      onClick={(e) => { e.stopPropagation(); onMove(block.id, -1) }}
                      className="rounded p-0.5 hover:bg-zinc-100 disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      title="Omlaag"
                      disabled={idx === blocks.length - 1}
                      onClick={(e) => { e.stopPropagation(); onMove(block.id, 1) }}
                      className="rounded p-0.5 hover:bg-zinc-100 disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      title="Verwijderen"
                      onClick={(e) => { e.stopPropagation(); onDelete(block.id) }}
                      className="rounded p-0.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {/* Rendered block — matches sent email exactly */}
                <div
                  dangerouslySetInnerHTML={{ __html: renderBlockToHtml(block) }}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
