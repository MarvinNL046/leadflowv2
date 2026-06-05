import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Settings,
  Route as RouteIcon,
  Plug,
  MessageCircle,
  ChevronRight,
  Kanban as KanbanIcon,
  Mail,
  Bot,
} from 'lucide-react'
import {
  Card,
  CardContent,
} from '#/components/ui/card.tsx'

export const Route = createFileRoute('/crm/settings')({
  component: SettingsHubPage,
})

interface HubItem {
  to: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  badge?: string
}

interface HubSection {
  title: string
  description: string
  items: HubItem[]
}

const SECTIONS: HubSection[] = [
  {
    title: 'CRM-gedrag',
    description: 'Hoe leads en opportunities door je pijplijn bewegen',
    items: [
      {
        to: '/crm/settings/lead-flow',
        title: 'Lead-flow',
        description:
          '3-strike belregel, follow-up dagen, reminder-trigger',
        icon: RouteIcon,
        iconColor: 'bg-cyan-100 text-cyan-700',
      },
      {
        to: '/crm/settings/pipeline',
        title: 'Pipeline-stages',
        description:
          'Stages toevoegen, volgorde, kleuren en Gewonnen/Verloren-markering',
        icon: KanbanIcon,
        iconColor: 'bg-violet-100 text-violet-700',
      },
      {
        to: '/crm/settings/templates',
        title: 'Email-templates',
        description:
          'Aanpassen wat verstuurd wordt bij Buiten werkgebied / Niet bereikt / Afspraak-reminder',
        icon: Mail,
        iconColor: 'bg-blue-100 text-blue-700',
      },
      {
        to: '/crm/settings/ai-agent',
        title: 'AI-instellingen',
        description:
          'API-key, context, toon en guardrails voor de AI-reactie-nodes',
        icon: Bot,
        iconColor: 'bg-violet-100 text-violet-700',
      },
    ],
  },
  {
    title: 'Integraties',
    description: 'Externe diensten die leads inbrengen of berichten versturen',
    items: [
      {
        to: '/crm/settings/meta',
        title: 'Meta (Facebook & Instagram)',
        description:
          'OAuth-koppeling, paginas, lead-forms ophalen + routing per form',
        icon: Plug,
        iconColor: 'bg-blue-100 text-blue-700',
      },
      {
        to: '/crm/settings/whatsapp',
        title: 'WhatsApp via Voidfix',
        description:
          'QR-code koppelen, sessie-status, automatische berichten via wa.voidfix.com',
        icon: MessageCircle,
        iconColor: 'bg-green-100 text-green-700',
      },
    ],
  },
]

function SettingsHubPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100">
          <Settings className="h-4.5 w-4.5 text-zinc-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Instellingen</h1>
          <p className="text-xs text-zinc-500">
            Configuratie voor jouw workspace en integraties
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                {section.title}
              </h2>
              <p className="text-xs text-zinc-500">{section.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group"
                  >
                    <Card className="transition-colors hover:border-violet-300">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-zinc-900">
                                {item.title}
                              </h3>
                              {item.badge && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
