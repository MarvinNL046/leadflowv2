const reasons:Record<string,string> = {
  niche:'Geen actief afnemersprofiel voor dit vakgebied',
  service:'Type werk valt buiten de afnemersvoorkeuren',
  unknown_service:'Type werk ontbreekt; eerst vaststellen',
  province:'Provincie valt buiten het ingestelde werkgebied',
  unknown_province:'Provincie ontbreekt; eerst vaststellen',
  segment:'Particulier/zakelijk sluit niet aan',
  already_purchased:'Passende afnemer heeft deze aanvraag al gekocht',
  mode:'Beschikbare verkoopvorm sluit niet aan op de voorkeur',
  no_active_buyers:'Geen actieve afnemers met ingestelde voorkeuren',
};

export function LeadCoverage({coverage}:{coverage:{status:'covered'|'uncovered'|'unavailable'|'unknown';matchingBuyers:number;complete:boolean;reasons:string[]}}) {
  if(coverage.status==='unavailable') return <p className="mt-3 text-xs text-zinc-500">Afnemerdekking: niet beschikbaar voor nieuwe kopers.</p>;
  if(coverage.status==='unknown') return <p className="mt-3 rounded-md bg-zinc-100 p-3 text-sm text-zinc-700">Afnemerdekking nog niet volledig gecontroleerd. Er is nog geen passende afnemer gevonden.</p>;
  return <div className={`mt-3 rounded-md p-3 text-sm ${coverage.status==='covered'?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`}>
    <p className="font-medium">{coverage.status==='covered'
      ? `${coverage.complete?'':'Minimaal '}${coverage.matchingBuyers} passende actieve afnemer${coverage.matchingBuyers===1?'':'s'}`
      : 'Geen passende actieve afnemer'}</p>
    {coverage.status==='uncovered' && <ul className="mt-1 list-inside list-disc">{coverage.reasons.map(reason=><li key={reason}>{reasons[reason]??'Voorkeuren controleren'}</li>)}</ul>}
  </div>;
}
