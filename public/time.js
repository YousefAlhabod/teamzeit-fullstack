// Form values always represent Berlin time, irrespective of the viewer's device timezone.
export function berlinToUtc(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Bitte Datum und Uhrzeit eingeben.');
 const base=Date.parse(value+'Z');
 const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(const offset of [2,1]){
  const candidate=new Date(base-offset*3600000);
  if(Number.isFinite(candidate.getTime())&&formatter.format(candidate).replace(' ','T')===value)return candidate.toISOString();
 }
 throw Error('Diese Uhrzeit existiert in Berlin nicht. Bitte die Zeitumstellung beachten.');
}
