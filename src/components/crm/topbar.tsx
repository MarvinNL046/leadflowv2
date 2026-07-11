import { useQuery } from 'convex/react'
import { useClerk } from '@clerk/clerk-react'
import { Menu } from "@/components/icons"
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { api } from '../../../convex/_generated/api'

export function CrmTopbar({
  onMenuClick,
}: {
  onMenuClick?: () => void
}) {
  const { signOut } = useClerk()
  const profile = useQuery(api.userProfiles.me)
  const tenants = useQuery(api.userProfiles.myTenants)

  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const userInitials = profile?.firstName
    ? profile.firstName.slice(0, 2).toUpperCase()
    : 'U'

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 sm:px-6">
      {/* Mobile hamburger + tenant context */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {onMenuClick && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 md:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        {tenant ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-zinc-900">
              {tenant.org?.name}
            </span>
            <span className="hidden text-zinc-400 sm:inline">·</span>
            <span className="hidden truncate text-zinc-600 sm:inline">
              {tenant.workspace?.name}
            </span>
            {profile?.isSuperAdmin && (
              <Badge
                variant="secondary"
                className="ml-1 hidden bg-[#d7ece8] text-[#173a40] sm:inline-flex"
              >
                super-admin
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-zinc-400">Geen workspace</span>
        )}
      </div>

      {/* User + actions */}
      <div className="flex shrink-0 items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-[#d7ece8] text-xs font-medium text-[#173a40]">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void signOut()}
        >
          Uitloggen
        </Button>
      </div>
    </header>
  )
}
