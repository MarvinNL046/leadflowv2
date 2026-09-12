import {useState} from 'react';
import {useMutation} from 'convex/react';
import {ConvexError} from 'convex/values';
import {api} from '../../../convex/_generated/api';
import type {Id} from '../../../convex/_generated/dataModel';
type Action='pause'|'resume';
export function SaleReview({leadId,action,revision,latest}:{leadId:Id<'marketplaceLeads'>;action:Action|null;revision:number;latest:{at:number;note:string;action:Action}|null}){
  const save=useMutation(api.marketplace.admin.reviewSale);
  const [draft,setDraft]=useState<{action:Action;revision:number}|null>(null),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent){
    e.preventDefault();if(!draft)return;setError('');
    if(note.trim().length<3){setError('Vul een reden in.');return;}
    if(draft.action==='resume'&&!confirmed){setError('Controleer eerst of de aanvraag nog actueel is.');return;}
    setSaving(true);
    try{await save({leadId,action:draft.action,expectedRevision:draft.revision,note:note.trim(),confirmedCurrent:confirmed});setDraft(null);}
    catch(err){setError(err instanceof ConvexError&&typeof err.data==='string'?err.data:'Opslaan is niet gelukt. Controleer de actuele gegevens en probeer opnieuw.');}
    finally{setSaving(false);}
  }
  return <div className="mt-3 text-sm">
    {latest&&<p className="mb-2 break-words text-xs text-zinc-600">{latest.action==='pause'?'Uit verkoop gehaald':'Opnieuw beschikbaar gemaakt'} op {new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(latest.at)}: {latest.note}</p>}
    {action&&!draft&&<button type="button" className="rounded-md border px-3 py-2 font-medium hover:bg-zinc-50" onClick={()=>{setDraft({action,revision});setNote('');setConfirmed(false);setError('');}}>{action==='pause'?'Tijdelijk uit verkoop':'Na controle opnieuw aanbieden'}</button>}
    {draft&&<form onSubmit={submit} className="space-y-3 rounded-lg border bg-zinc-50 p-3">
      <p className="font-medium">{draft.action==='pause'?'Zet deze aanvraag op Te beoordelen':'Maak deze aanvraag opnieuw beschikbaar'}</p>
      <p className="text-xs text-zinc-600">{draft.action==='pause'?'De aanvraag verdwijnt uit de verkoop en kan niet meer worden gekocht. Reeds verstuurde berichten kunnen niet worden ingetrokken.':'De aanvraag wordt weer zichtbaar voor passende kopers. Er wordt geen nieuwe melding verstuurd.'} De oorspronkelijke datums en verificatie blijven behouden.</p>
      <label className="block font-medium">Reden voor deze verkoopwijziging<textarea required minLength={3} maxLength={500} rows={2} value={note} disabled={saving} onChange={e=>setNote(e.target.value)} className="mt-1 block w-full rounded-md border bg-white p-2"/></label>
      {draft.action==='resume'&&<label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} disabled={saving} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>Ik heb gecontroleerd dat deze aanvraag nog actueel is.</label>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving} className="rounded-md bg-indigo-700 px-3 py-2 font-medium text-white disabled:opacity-50">{saving?'Opslaan…':draft.action==='pause'?'Uit verkoop halen':'Opnieuw aanbieden'}</button><button type="button" disabled={saving} className="rounded-md border px-3 py-2" onClick={()=>setDraft(null)}>Annuleren</button></div>
    </form>}
  </div>;
}
