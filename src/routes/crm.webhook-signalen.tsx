import {useState} from 'react'
import {createFileRoute} from '@tanstack/react-router'
import {useMutation,usePaginatedQuery,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
import {Button} from '#/components/ui/button'
import {Card,CardContent} from '#/components/ui/card'

export const Route=createFileRoute('/crm/webhook-signalen')({component:WebhookSignalsPage})
const reasons:Record<string,string>={unmapped_session:'Sessie ontbreekt, is onbekend of niet eenduidig gekoppeld',conflicting_session:'Tegenstrijdige sessiegegevens',unmapped_account:'Account heeft geen eenduidige werkruimte',unmatched_receipt:'Bezorgstatus kan niet aan één uitgaand bericht worden gekoppeld',missing_sender:'Afzender ontbreekt',missing_recipient:'Ontvanger ontbreekt',invalid_payload:'Berichtformaat niet leesbaar'}
const channels:Record<string,string>={email:'E-mail',sms:'SMS',whatsapp:'WhatsApp'}
const date=(value:number)=>new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(value)
function WebhookSignalsPage(){
  const profile=useQuery(api.userProfiles.me)
  if(profile===undefined)return <p role="status">Beheer laden…</p>
  if(!profile?.isSuperAdmin)return <p>Dit overzicht is alleen beschikbaar voor platformbeheerders.</p>
  return <SignalsOverview/>
}
function SignalsOverview(){
  const [onlyOpen,setOnlyOpen]=useState(true)
  const {results,status,loadMore}=usePaginatedQuery(api.webhookSignals.list,{onlyOpen},{initialNumItems:25})
  return <div className="mx-auto w-full max-w-4xl space-y-5">
    <header><h1 className="text-2xl font-bold">Webhooksignalen</h1><p className="mt-2 text-sm text-zinc-600">Overgeslagen providerberichten en bezorgstatussen, gegroepeerd per kanaal en oorzaak. Registratie begint vanaf deze update; eerdere meldingen staan hier niet.</p></header>
    <Card><CardContent className="p-4 text-sm text-zinc-700">Dit overzicht bewaart aantallen en tijdstippen, geen berichtinhoud, telefoonnummers of sleutels. Een signaal controleren verwerkt geen berichten opnieuw. Een nieuwe melding opent het signaal weer.</CardContent></Card>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/>Alleen te controleren</label>
    {status==='LoadingFirstPage' ? <p role="status">Signalen laden…</p> : results.length===0 ? <p className="rounded-lg border p-5 text-sm">{onlyOpen?'Geen openstaande signalen geregistreerd.':'Nog geen signalen geregistreerd.'} Nieuwe meldingen verschijnen hier automatisch. Dit is geen bevestiging dat alle providerverbindingen werken.</p> : results.map(signal=><SignalRow key={signal.id} signal={signal}/>)}
    {status==='CanLoadMore' && <Button variant="outline" onClick={()=>loadMore(25)}>Meer laden</Button>}
  </div>
}
type Signal={id:Id<'webhookSignals'>,channel:string,reason:string,count:number,firstSeenAt:number,lastSeenAt:number,open:boolean,reviewedCount:number,lastReviewedAt:number|null,lastReviewNote:string|null}
function SignalRow({signal}:{signal:Signal}){
  const review=useMutation(api.webhookSignals.review)
  const [expectedCount,setExpectedCount]=useState(signal.count)
  const [editing,setEditing]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{await review({id:signal.id,expectedCount,note});setEditing(false);setNote('')}catch{setError('Opslaan is niet gelukt. Er kan een nieuwe melding zijn binnengekomen; controleer de aantallen en probeer opnieuw.')}finally{setBusy(false)}}
  return <Card><CardContent className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold">{channels[signal.channel]} · {reasons[signal.reason]}</h2><span className={signal.open?'text-sm font-medium text-amber-800':'text-sm text-emerald-700'}>{signal.open?'Te controleren':'Gecontroleerd'}</span></div>
    <p className="text-sm">{signal.count} meldingen in totaal · {signal.count-signal.reviewedCount} sinds de laatste controle</p>
    <p className="text-xs text-zinc-600">Eerste: {date(signal.firstSeenAt)} · Laatste: {date(signal.lastSeenAt)}</p>
    {signal.lastReviewedAt && <p className="text-sm text-zinc-600">Laatste controle: {date(signal.lastReviewedAt)} · {signal.lastReviewNote}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {signal.open && (editing?<form onSubmit={submit} className="space-y-2"><label className="grid gap-1 text-sm">Wat heb je gecontroleerd?<textarea className="rounded-md border p-2" value={note} onChange={e=>setNote(e.target.value)} minLength={3} maxLength={500} required/></label><div className="flex gap-2"><Button type="submit" disabled={busy || note.trim().length<3}>{busy?'Opslaan…':'Markeer gecontroleerd'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(false)}>Annuleren</Button></div></form>:<Button variant="outline" onClick={()=>{setExpectedCount(signal.count);setEditing(true)}}>Controle vastleggen</Button>)}
  </CardContent></Card>
}
