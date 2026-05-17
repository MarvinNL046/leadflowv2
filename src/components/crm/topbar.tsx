import { useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { api } from '../../../convex/_generated/api'

export function CrmTopbar() {
  const { signOut } = useAuthActions()
  const profile = useQuery(api.userProfiles.me)
  const tenants = useQuery(api.userProfiles.myTenants)

  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const userInitials = profile?.firstName
    ? profile.firstName.slice(0, 2).toUpperCase()
    : 'U'

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      {/* Tenant context */}
      <div className="flex items-center gap-2 text-sm">
        {tenant ? (
          <>
            <span className="font-medium text-zinc-900">
              {tenant.org?.name}
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600">{tenant.workspace?.name}</span>
            {profile?.isSuperAdmin && (
              <Badge
                variant="secondary"
                className="ml-2 bg-violet-100 text-violet-800"
              >
                super-admin
              </Badge>
            )}
          </>
        ) : (
          <span className="text-zinc-400">Geen workspace</span>
        )}
      </div>

      {/* User + actions */}
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-violet-100 text-xs font-medium text-violet-800">
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
