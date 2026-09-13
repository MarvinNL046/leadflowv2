import {useState} from 'react'
import {createFileRoute,Link} from '@tanstack/react-router'
import {useMutation,usePaginatedQuery,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
import {Input} from '#/components/ui/input'
import {Button} from '#/components/ui/button'
import {Card,CardContent} from '#/components/ui/card'

export const Route=createFileRoute('/crm/webhook-signalen')({component:WebhookSignalsPage})
const reasons:Record<string,string>={unmapped_session:'Sessie ontbreekt, is onbekend of niet eenduidig gekoppeld',conflicting_session:'Tegenstrijdige sessiegegevens',unmapped_account:'Account heeft geen eenduidige werkruimte',unmatched_receipt:'Bezorgstatus kan niet aan één uitgaand bericht worden gekoppeld',missing_sender:'Afzender ontbreekt',missing_recipient:'Ontvanger ontbreekt',invalid_payload:'Berichtformaat niet leesbaar'}
const channels:Record<string,string>={email:'E-mail',sms:'SMS',whatsapp:'WhatsApp'}
const providers:Record<string,{name:string,url:string}>={email:{name:'Resend',url:'https://resend.com/'},sms:{name:'Voidfix SMS',url:'https://sms.voidfix.com/dashboard.php'},whatsapp:{name:'Voidfix WhatsApp',url:'https://wa.voidfix.com/'}}
const explanations:Record<string,string>={
  unmatched_receipt:'De provider stuurde een bezorgstatus terug. LeadFlow vond daarvoor geen unieke koppeling met een uitgaand CRM-bericht en heeft de status daarom niet verwerkt.',
  unmapped_session:'Een providerbericht kon niet via de sessie aan precies één werkruimte worden gekoppeld. Controleer de sessie en de koppeling in LeadFlow.',
  conflicting_session:'Het providerbericht bevatte tegenstrijdige sessiegegevens. Controleer welke sessie de webhook verstuurt en bij welke koppeling die hoort.',
  unmapped_account:'Het provideraccount kon niet aan precies één werkruimte worden gekoppeld. Controleer het account en de ingestelde webhook.',
  missing_sender:'In het providerbericht ontbrak een bruikbare afzender. Controleer het gebeurtenisformaat bij de provider.',
  missing_recipient:'In het providerbericht ontbrak een bruikbare ontvanger. Controleer het gebeurtenisformaat bij de provider.',
  invalid_payload:'LeadFlow kon het ontvangen providerbericht niet lezen. Controleer het formaat en de webhookinstellingen bij de provider.'
}
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
    <Card><CardContent className="p-4 text-sm text-zinc-700">Dit overzicht bewaart aantallen, tijdstippen en maximaal vijf recente referenties per groep, geen berichtinhoud, telefoonnummers of sleutels. Een signaal controleren verwerkt geen berichten opnieuw. Een nieuwe melding opent het signaal weer.</CardContent></Card>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/>Alleen te controleren</label>
    {status==='LoadingFirstPage' ? <p role="status">Signalen laden…</p> : results.length===0 ? <p className="rounded-lg border p-5 text-sm">{onlyOpen?'Geen openstaande signalen geregistreerd.':'Nog geen signalen geregistreerd.'} Nieuwe meldingen verschijnen hier automatisch. Dit is geen bevestiging dat alle providerverbindingen werken.</p> : results.map(signal=><SignalRow key={signal.id} signal={signal}/>)}
    {status==='CanLoadMore' && <Button variant="outline" onClick={()=>loadMore(25)}>Meer laden</Button>}
  </div>
}
type Signal={recent?:Array<{reference:string,seenAt:number,providerMessageId?:string}>,id:Id<'webhookSignals'>,channel:string,reason:string,count:number,firstSeenAt:number,lastSeenAt:number,open:boolean,reviewedCount:number,lastReviewedAt:number|null,lastReviewNote:string|null}
function SignalRow({signal}:{signal:Signal}){
  const review=useMutation(api.webhookSignals.review)
  const [expectedCount,setExpectedCount]=useState(signal.count)
  const [editing,setEditing]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{await review({id:signal.id,expectedCount,note});setEditing(false);setNote('')}catch{setError('Opslaan is niet gelukt. Er kan een nieuwe melding zijn binnengekomen; controleer de aantallen en probeer opnieuw.')}finally{setBusy(false)}}
  return <Card><CardContent className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold">{channels[signal.channel]} · {reasons[signal.reason]}</h2><span className={signal.open?'text-sm font-medium text-amber-800':'text-sm text-emerald-700'}>{signal.open?'Te controleren':'Gecontroleerd'}</span></div>
    <p className="text-sm">{signal.count} {signal.count===1?'melding':'meldingen'} in totaal · {signal.count-signal.reviewedCount} sinds de laatste controle</p>
    <p className="text-xs text-zinc-600">Eerste: {date(signal.firstSeenAt)} · Laatste: {date(signal.lastSeenAt)}</p>
    <SignalHelp signal={signal}/><SignalReferences signal={signal}/>
    {signal.lastReviewedAt && <p className="text-sm text-zinc-600">Laatste controle: {date(signal.lastReviewedAt)} · {signal.lastReviewNote}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {signal.open && (editing?<form onSubmit={submit} className="space-y-2"><label className="grid gap-1 text-sm">Wat heb je gecontroleerd?<textarea className="rounded-md border p-2" value={note} onChange={e=>setNote(e.target.value)} minLength={3} maxLength={500} required/></label><div className="flex gap-2"><Button type="submit" disabled={busy || note.trim().length<3}>{busy?'Opslaan…':'Markeer gecontroleerd'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(false)}>Annuleren</Button></div></form>:<Button variant="outline" onClick={()=>{setExpectedCount(signal.count);setEditing(true)}}>Controle vastleggen</Button>)}
  </CardContent></Card>
}
function SignalHelp({signal}:{signal:Signal}){
  const provider=providers[signal.channel]
  return <aside aria-label="Uitleg bij dit signaal" className="space-y-3 rounded-lg border bg-zinc-50 p-4 text-sm text-zinc-700">
    <h3 className="font-semibold text-zinc-900">Welke melding is dit?</h3>
    <p>{explanations[signal.reason] ?? 'Een providergebeurtenis is overgeslagen. Controleer de gebeurtenis en de koppeling bij de provider.'}</p>
    {provider && <p><strong>Bron:</strong> een binnenkomende webhook van {provider.name}. Dit overzicht groepeert meldingen uit het platform; de melding hoort niet automatisch bij je huidige bedrijf.</p>}
    <details className="space-y-3">
      <summary className="cursor-pointer font-medium text-zinc-900">Hoe onderzoek ik dit?</summary>
      <p>Zoek bij de provider rond {date(signal.lastSeenAt)} (tijdzone Amsterdam) naar webhookgebeurtenissen. Dit is het moment van registratie in LeadFlow, niet noodzakelijk het verzendmoment van het bericht.</p>
      {signal.reason==='unmatched_receipt' && <p>Mogelijke oorzaken zijn een bericht buiten het CRM{signal.channel==='email'?' (bijvoorbeeld een verificatiemail of beheerdersnotificatie)':''}, ontbrekende berichthistorie of een niet-eenduidige berichtkoppeling. Deze telling bewijst niet dat een bericht niet is bezorgd of dat een lead verloren is gegaan.</p>}
      <p>Bij recente e-mailbezorgmeldingen staat hieronder een Resend-bericht-ID als dat veilig kon worden bewaard. Gebruik dat ID in je Resend-account om de mail te zoeken. De LeadFlow-referentie is alleen voor intern overleg; deze is niet door de provider uitgegeven. Zonder Resend-ID kunnen we de melding niet rechtstreeks naar één bericht herleiden. Herhaalde afleverpogingen van dezelfde webhook kunnen meerdere meldingen opleveren.</p>
      <p>Vergelijk de gegevens bij de provider met de berichten van het betrokken bedrijf. De CRM-link hieronder toont alleen de berichten waarvoor je in je huidige bedrijfsomgeving toegang hebt.</p>
    </details>
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {provider && <a href={provider.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">Open {provider.name} (nieuw tabblad)</a>}
      <Link to="/crm/messages" className="font-medium underline">Bekijk CRM-berichten</Link>
    </div>
  </aside>
}

function SignalReferences({signal}:{signal:Signal}){
  const recent=signal.recent??[];
  return <details className="rounded-lg border p-4 text-sm">
    <summary className="cursor-pointer font-medium">Recente meldingen en referenties ({recent.length})</summary>
    {!recent.length?<p className="mt-3 text-muted-foreground">Voor deze oudere meldingen zijn geen referenties bewaard. Nieuwe meldingen krijgen automatisch een referentie.</p>:<>
      <p className="my-3 text-muted-foreground">De vijf meest recente registraties, nieuwste bovenaan. Dit is geen volledig archief. Herhaalde webhookpogingen krijgen ieder een eigen LeadFlow-referentie.</p>
      <ol className="space-y-4">{recent.map(item=><li key={item.reference} className="space-y-2 border-t pt-3">
        <p>{date(item.seenAt)}</p>
        <label className="grid gap-1">LeadFlow-referentie<Input readOnly className="font-mono text-xs" value={item.reference} onFocus={e=>e.target.select()}/></label>
        {item.providerMessageId?<label className="grid gap-1">Resend-bericht-ID<Input readOnly className="font-mono text-xs" value={item.providerMessageId} onFocus={e=>e.target.select()}/></label>:<p className="text-muted-foreground">Geen veilig providerbericht-ID beschikbaar voor deze registratie. Onderzoek via kanaal en tijdstip.</p>}
      </li>)}</ol>
    </>}
  </details>
}
