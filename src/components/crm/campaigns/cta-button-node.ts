import { Node, mergeAttributes } from '@tiptap/core'

// Minimal command-type augmentation so TypeScript accepts setCtaButton.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ctaButton: {
      setCtaButton: (attrs: { text: string; href: string }) => ReturnType
    }
  }
}

export const CtaButton = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: { default: 'Plan je afspraak' },
      href: { default: 'https://staycoolairco.nl' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-cta]',
        getAttrs: (el) => ({
          text: (el as HTMLElement).textContent ?? 'Plan je afspraak',
          href: (el as HTMLElement).getAttribute('href') ?? '#',
        }),
      },
    ]
  },

  renderHTML({ node }) {
    // E-mail-veilige branded knop met inline styles. Gewrapt in een <p> met
    // marge zodat de knop los staat in de mail.
    return [
      'p',
      { style: 'margin:8px 0 18px;' },
      [
        'a',
        mergeAttributes({
          'data-cta': '',
          href: node.attrs.href as string,
          style:
            'display:inline-block;background:#2080C0;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif;',
        }),
        node.attrs.text as string,
      ],
    ]
  },

  addCommands() {
    return {
      setCtaButton:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs })
            .run(),
    }
  },
})
