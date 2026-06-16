import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TiptapImage from '@tiptap/extension-image'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { CtaButton } from '#/components/crm/campaigns/cta-button-node.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Link2,
  MousePointerClick,
  ImagePlus,
} from 'lucide-react'
import { toast } from 'sonner'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const resolveStorageUrl = useMutation(api.files.resolveStorageUrl)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
      }),
      TiptapImage.configure({
        inline: false,
        HTMLAttributes: {
          style: 'max-width:100%;height:auto;border-radius:8px;',
        },
      }),
      CtaButton,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[200px] rounded-b-md border border-t-0 border-zinc-200 p-3 focus:outline-none',
      },
    },
  })

  // Sync external value changes (e.g. template insert) without looping on normal typing
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  const handleCtaButton = () => {
    const text = window.prompt('Knoptekst:', 'Plan je afspraak')
    if (text === null || text.trim() === '') return
    const href = window.prompt('Link-URL:', 'https://staycoolairco.nl')
    if (!href) return
    if (!/^https?:\/\//i.test(href)) {
      toast.error('Alleen https:// of http:// links zijn toegestaan')
      return
    }
    editor.chain().focus().insertContent({ type: 'ctaButton', attrs: { text, href } }).run()
  }

  const handleLink = () => {
    if (editor.isActive('link')) {
      const url = window.prompt('Link-URL:', editor.getAttributes('link').href as string ?? '')
      if (url === null) return // cancelled
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
      } else {
        if (!/^https?:\/\//i.test(url)) {
          toast.error('Alleen https:// of http:// links')
          return
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      }
    } else {
      const url = window.prompt('Link-URL:')
      if (!url) return
      if (!/^https?:\/\//i.test(url)) {
        toast.error('Alleen https:// of http:// links')
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset zodat dezelfde file opnieuw kan
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Afbeelding mag maximaal 5 MB zijn'); return }
    setUploading(true)
    try {
      const postUrl = await generateUploadUrl()
      const res = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!res.ok) throw new Error('Upload mislukt')
      const { storageId } = await res.json()
      const url = await resolveStorageUrl({ storageId })
      editor?.chain().focus().setImage({ src: url }).run()
    } catch (err) {
      toast.error('Afbeelding uploaden mislukt')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="rounded-t-md border border-zinc-200 bg-zinc-50 p-1.5 flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-zinc-200' : ''}
          title="Vet"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-zinc-200' : ''}
          title="Cursief"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'bg-zinc-200' : ''}
          title="Koptekst H2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'bg-zinc-200' : ''}
          title="Ongeordende lijst"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'bg-zinc-200' : ''}
          title="Genummerde lijst"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleLink}
          className={editor.isActive('link') ? 'bg-zinc-200' : ''}
          title="Link invoegen / bewerken"
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <span className="mx-1 w-px self-stretch bg-zinc-200" aria-hidden="true" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCtaButton}
          className="flex items-center gap-1"
          title="CTA-knop invoegen"
        >
          <MousePointerClick className="h-4 w-4" />
          <span className="text-xs">Knop</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1"
          title="Afbeelding invoegen"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-xs">Afbeelding</span>
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
