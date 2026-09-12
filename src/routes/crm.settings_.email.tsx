import {useState} from 'react'
import {createFileRoute} from '@tanstack/react-router'
import {useAction,useMutation,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
import {Button} from '#/components/ui/button'
import {Card,CardContent} from '#/components/ui/card'
export const Route=createFileRoute('/crm/settings_/email')({component:EmailSettings})
function EmailSettings(){
  const tenants=useQuery(api.userProfiles.myTenants)
  const workspaceId=tenants?.find(t=>t.workspace)?.workspace?.id
  const rows=useQuery(api.companyEmail.list,workspaceId?{workspaceId}:'skip')
  const prepare=useMutation(api.companyEmail.prepare),disable=useMutation(api.companyEmail.disable)
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
  async function run(fn:()=>Promise<unknown>){setBusy(true);setError(null);try{await fn()}catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt')}finally{setBusy(false)}}
  return <div className="mx-auto max-w-3xl space-y-5"><h1 className="text-2xl font-bold">Eigen e-mailkoppeling</h1>
    <p className="text-sm text-zinc-600">Gebruik je eigen Resend-account voor CRM-berichten en campagnes. Dit koppelt verzending en bezorgstatussen; antwoorden op e-mails worden nog niet als mailbox ingelezen.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {rows===undefined?<p role="status">Koppelingen laden…</p>:<>
      {!rows.length && <p className="rounded-lg border p-4 text-sm">Nog geen eigen e-mailkoppeling. Een eventueel bestaande platformkoppeling blijft actief totdat je een eigen koppeling activeert.</p>}
      {rows.map(row=><Card key={row.id}><CardContent className="space-y-3 p-4"><h2 className="font-semibold">{row.status==='draft'?'Koppeling voorbereiden':row.status==='active'?'Actief':'Gepauzeerd'}{row.from?` · ${row.from}`:''}</h2>
        {row.verifiedAt && <p className="text-xs text-zinc-600">Gecontroleerd op {new Date(row.verifiedAt).toLocaleString('nl-NL')}</p>}
        {row.status==='draft'?<SetupForm id={row.id} endpoint={row.endpoint}/>:row.status==='active'?<><p className="text-sm">Pauzeren stopt nieuwe verzendingen via deze koppeling. Lopende verzendingen kunnen afronden; bezorgstatussen blijven binnenkomen.</p><Button variant="outline" disabled={busy} onClick={()=>run(()=>disable({id:row.id}))}>Verzending pauzeren</Button></>:<p className="text-sm">Maak een nieuw concept om opnieuw te koppelen. Oude bezorgstatussen blijven aan deze koppeling gebonden.</p>}
      </CardContent></Card>)}
      {!rows.some(r=>r.status==='draft') && <Button disabled={busy || !workspaceId} onClick={()=>run(()=>prepare({workspaceId:workspaceId!}))}>Eigen koppeling voorbereiden</Button>}
    </>}
  </div>
}
function SetupForm({id,endpoint}:{id:Id<'companyEmailConnections'>,endpoint:string}){
  const activate=useAction(api.companyEmail.activate)
  const [values,setValues]=useState({apiKey:'',fromEmail:'',fromName:'',domainId:'',webhookId:''}),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{await activate({id,...values});setValues({...values,apiKey:''})}catch(e){setError(e instanceof Error?e.message:'Controle mislukt')}finally{setBusy(false)}}
  return <form onSubmit={submit} className="space-y-4">
    <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Verifieer je verzenddomein in Resend en kopieer de domein-ID.</li><li>Maak in Resend een actieve webhook met onderstaand adres. Selecteer email.delivered, email.bounced, email.complained en email.opened. Kopieer de webhook-ID.</li><li>Vul een API-key in die dit domein en deze webhook kan lezen én e-mails kan versturen. LeadFlow controleert de instellingen en bewaart de sleutels versleuteld.</li></ol>
    <label className="grid gap-1 text-sm">Webhookadres<input className="rounded-md border bg-zinc-50 p-2 text-xs" readOnly value={endpoint} onFocus={e=>e.target.select()}/></label>
    {([['fromName','Afzendernaam','text'],['fromEmail','Afzenderadres','email'],['domainId','Domein-ID uit Resend','text'],['webhookId','Webhook-ID uit Resend','text'],['apiKey','Resend API-key','password']] as const).map(([key,label,type])=><label key={key} className="grid gap-1 text-sm">{label}<input className="rounded-md border p-2" type={type} autoComplete="off" required={key!=='fromName'} maxLength={key==='apiKey'?500:254} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/></label>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm text-zinc-600">Activeren verstuurt geen testmail. Nieuwe CRM-berichten en campagnebatches gebruiken daarna deze afzender. Pauzeer een eerdere eigen koppeling voordat je deze activeert.</p>
    <Button disabled={busy} type="submit">{busy?'Instellingen controleren…':'Controleren en activeren'}</Button>
  </form>
}
