import {SignUp} from '@clerk/clerk-react'
import {Authenticated,Unauthenticated} from 'convex/react'
import {createFileRoute,Link} from '@tanstack/react-router'

export const Route=createFileRoute('/registreren')({component:RegistrationPage})
function RegistrationPage(){
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
    <Authenticated><h1 className="text-2xl font-bold">Je bent ingelogd</h1><Link to="/aan-de-slag" className="text-primary underline">Verder met je bedrijfsomgeving</Link></Authenticated>
    <Unauthenticated><SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/aan-de-slag"/></Unauthenticated>
    <Link to="/" className="text-sm text-muted-foreground underline">Terug naar LeadFlow</Link>
  </main>
}
