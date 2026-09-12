import {useState} from 'react';
import {useMutation} from 'convex/react';
import {ConvexError} from 'convex/values';
import {api} from '../../../convex/_generated/api';
import type {Id} from '../../../convex/_generated/dataModel';

type Service='install'|'maintain'|'repair';
export function ServiceReview({leadId,current,revision,canEdit,latest}:{leadId:Id<'marketplaceLeads'>;current:string|null;revision:number;canEdit:boolean;latest:{at:number;note:string}|null}) {
  const save=useMutation(api.marketplace.admin.reviewServiceType);
  const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false);
  const [value,setValue]=useState(current??''),[note,setNote]=useState(''),[error,setError]=useState('');
  const [base,setBase]=useState({current,revision});
  async function submit(e:React.FormEvent){
    e.preventDefault();setError('');
    if(note.trim().length<3){setError('Vul een korte toelichting in.');return;}
    setSaving(true);
    try{
      await save({leadId,serviceType:(value||null) as Service|null,expectedServiceType:base.current as Service|null,expectedRevision:base.revision,note:note.trim()});
      setEditing(false);setNote('');
    }catch(err){setError(err instanceof ConvexError&&typeof err.data==='string'?err.data:'Opslaan is niet gelukt. Controleer de actuele gegevens en probeer opnieuw.');}
    finally{setSaving(false);}
  }
  return <div className="mt-3 text-sm">
    {latest&&<p className="mb-2 break-words text-xs text-zinc-600">Type werk gecontroleerd op {new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(latest.at)}: {latest.note}</p>}
    {canEdit&&!editing&&<button type="button" className="rounded-md border px-3 py-2 font-medium hover:bg-zinc-50" onClick={()=>{setValue(current??'');setBase({current,revision});setError('');setEditing(true);}}>Type werk controleren</button>}
    {canEdit&&editing&&<form onSubmit={submit} className="space-y-3 rounded-lg border bg-zinc-50 p-3">
      <p className="text-xs text-zinc-600">Leg vast wat je uit de aanvraag of uit contact hebt vastgesteld. Dit kan veranderen welke afnemers de aanvraag zien. De aanvraagdatum en verificatie blijven behouden; er wordt geen nieuwe melding verstuurd.</p>
      <label className="block font-medium">Type werk
        <select value={value} onChange={e=>setValue(e.target.value)} disabled={saving} className="mt-1 block w-full rounded-md border bg-white p-2">
          <option value="">Nog onbekend</option><option value="install">Installatie</option><option value="maintain">Onderhoud</option><option value="repair">Reparatie</option>
        </select>
      </label>
      <label className="block font-medium">Toelichting op de controle
        <textarea value={note} onChange={e=>setNote(e.target.value)} required minLength={3} maxLength={500} rows={2} disabled={saving} className="mt-1 block w-full rounded-md border bg-white p-2" placeholder="Bijvoorbeeld: in de aanvraag staat dat drie nieuwe binnenunits nodig zijn."/>
      </label>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-md bg-indigo-700 px-3 py-2 font-medium text-white disabled:opacity-50">{saving?'Opslaan…':'Gecontroleerd opslaan'}</button>
        <button type="button" disabled={saving} className="rounded-md border px-3 py-2" onClick={()=>{setEditing(false);setNote('');setError('');}}>Annuleren</button>
      </div>
    </form>}
  </div>;
}
