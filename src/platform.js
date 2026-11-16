import {HttpError,textField,validDate,MAX_TEXT} from './core.js';
import {berlinToUtc} from '../public/time.js';
export const defaultLocation='00000000-0000-4000-8000-000000000001';
export async function groupRole(env,userId,groupId){
 const row=await env.DB.prepare(`SELECT CASE WHEN a.user_id IS NOT NULL OR lm.user_id IS NOT NULL THEN 'trainer' ELSE m.role END AS role FROM groups g LEFT JOIN memberships m ON m.group_id=g.id AND m.user_id=? LEFT JOIN platform_admins a ON a.user_id=? LEFT JOIN location_managers lm ON lm.location_id=g.location_id AND lm.user_id=? WHERE g.id=?`).bind(userId,userId,userId,groupId).first();
 if(!row?.role)throw new HttpError(403,'Keine Berechtigung für diese Gruppe.');return row.role;
}
export async function isAdmin(env,uid){return !!await env.DB.prepare('SELECT user_id FROM platform_admins WHERE user_id=?').bind(uid).first();}
export async function manageLocation(env,uid,lid){
 if(await isAdmin(env,uid))return;
 if(!await env.DB.prepare('SELECT user_id FROM location_managers WHERE location_id=? AND user_id=?').bind(lid,uid).first())throw new HttpError(403,'Nur die Standortverantwortlichen oder die Plattformadministration.');
}
export async function groupsForUser(env,uid){
 return (await env.DB.prepare(`SELECT g.id,g.name,g.description,g.location_id AS locationId,l.name AS locationName,l.city,m.role AS membershipRole,CASE WHEN a.user_id IS NOT NULL OR lm.user_id IS NOT NULL THEN 'trainer' ELSE m.role END AS role FROM groups g JOIN locations l ON l.id=g.location_id LEFT JOIN memberships m ON m.group_id=g.id AND m.user_id=? LEFT JOIN platform_admins a ON a.user_id=? LEFT JOIN location_managers lm ON lm.location_id=g.location_id AND lm.user_id=? WHERE m.user_id IS NOT NULL OR a.user_id IS NOT NULL OR lm.user_id IS NOT NULL ORDER BY g.created_at,g.id LIMIT 500`).bind(uid,uid,uid).all()).results;
}
export async function locationData(env,uid){
 const admin=await isAdmin(env,uid);
 const rows=await env.DB.prepare(`SELECT l.id,l.name,l.city,CASE WHEN ?=1 OR lm.user_id IS NOT NULL THEN 1 ELSE 0 END AS canManage FROM locations l LEFT JOIN location_managers lm ON lm.location_id=l.id AND lm.user_id=? WHERE ?=1 OR lm.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM groups g JOIN memberships m ON m.group_id=g.id WHERE g.location_id=l.id AND m.user_id=?) ORDER BY l.city,l.name LIMIT 500`).bind(Number(admin),uid,Number(admin),uid).all();
 return {admin,locations:rows.results};
}
export function eventInput(data){
 const capacity=data.capacity===undefined||data.capacity===null||data.capacity===''?null:Number(data.capacity);
 if(capacity!==null&&(!Number.isInteger(capacity)||capacity<1||capacity>1000))throw new HttpError(400,'Teilnehmerlimit: 1 bis 1000 oder leer.');
 return {title:textField(data.title,'Titel',MAX_TEXT.title),startAt:validDate(data.startAt),location:textField(data.location,'Ort',MAX_TEXT.location),notes:textField(data.notes||'','Hinweise',MAX_TEXT.notes,false),capacity};
}
export function recurringDates(startAt,count){
 if(!Number.isInteger(count)||count<1||count>26)throw new HttpError(400,'Eine Serie umfasst 1 bis 26 wöchentliche Termine.');
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(startAt));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value])),dates=[startAt];
 const date=new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
 for(let i=1;i<count;i++){date.setUTCDate(date.getUTCDate()+7);try{dates.push(berlinToUtc(date.toISOString().slice(0,10)+`T${p.hour}:${p.minute}`));}catch{throw new HttpError(400,'Eine Uhrzeit der Serie existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.');}}return dates;
}
export async function createTraining(env,user,gid,data){
 const e=eventInput(data),dates=recurringDates(e.startAt,Number(data.repeatWeeks??1));
 const seriesId=dates.length>1?crypto.randomUUID():null,ids=dates.map(()=>crypto.randomUUID()),statements=[];
 if(seriesId)statements.push(env.DB.prepare('INSERT INTO training_series(id,group_id,created_by) VALUES(?,?,?)').bind(seriesId,gid,user.id));
 for(let i=0;i<dates.length;i++)statements.push(env.DB.prepare('INSERT INTO training_events(id,group_id,title,start_at,location,notes,created_by,capacity,series_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(ids[i],gid,e.title,dates[i],e.location,e.notes,user.id,e.capacity,seriesId));
 await env.DB.batch(statements);return {id:ids[0],ids,seriesId};
}
export function promotion(env,eid){
 return env.DB.prepare(`UPDATE responses SET booking_state='confirmed' WHERE event_id=? AND booking_state='waitlisted' AND user_id IN (SELECT user_id FROM responses WHERE event_id=? AND booking_state='waitlisted' ORDER BY queued_at,user_id LIMIT MAX(0,COALESCE((SELECT capacity FROM training_events WHERE id=?),100000)-(SELECT COUNT(*) FROM responses WHERE event_id=? AND booking_state='confirmed')))` ).bind(eid,eid,eid,eid);
}
export async function bookTraining(env,uid,eid,status,context){
 const e=context||await env.DB.prepare('SELECT start_at,EXISTS(SELECT 1 FROM memberships WHERE group_id=training_events.group_id AND user_id=?) AS is_member FROM training_events WHERE id=?').bind(uid,eid).first();
 if(!e)throw new HttpError(404,'Termin nicht gefunden.');
 if(!e.is_member)throw new HttpError(403,'Für eine Buchung bitte zuerst Mitglied der Gruppe werden.');
 if(status==='yes'&&e.start_at<=new Date().toISOString())throw new HttpError(409,'Dieses Training hat bereits begonnen.');
 let change;
 if(status===null){await env.DB.prepare('DELETE FROM responses WHERE event_id=? AND user_id=?').bind(eid,uid).run();return {status:null,bookingState:null};}
 else change=env.DB.prepare(`INSERT INTO responses(event_id,user_id,status,updated_at,booking_state,queued_at) VALUES(?,?,?, ?,CASE WHEN ?<>'yes' THEN NULL WHEN EXISTS(SELECT 1 FROM responses WHERE event_id=? AND user_id=? AND booking_state='confirmed') OR (SELECT capacity FROM training_events WHERE id=?) IS NULL OR (SELECT COUNT(*) FROM responses WHERE event_id=? AND booking_state='confirmed')<(SELECT capacity FROM training_events WHERE id=?) THEN 'confirmed' ELSE 'waitlisted' END,CASE WHEN ?='yes' THEN COALESCE((SELECT queued_at FROM responses WHERE event_id=? AND user_id=? AND status='yes'),?) ELSE NULL END) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,booking_state=excluded.booking_state,queued_at=excluded.queued_at RETURNING status,booking_state AS bookingState`).bind(eid,uid,status,new Date().toISOString(),status,eid,uid,eid,eid,eid,status,eid,uid,new Date().toISOString());
 // The upsert and cancellation-refill triggers execute as one SQLite transaction.
 return await change.first();
}
export function enqueueEventChange(env,eid,kind){return env.DB.prepare(`INSERT INTO notification_outbox(id,user_id,event_id,kind,title,start_at,venue) SELECT lower(hex(randomblob(16))),u.id,e.id,?,e.title,e.start_at,e.location FROM training_events e JOIN responses r ON r.event_id=e.id JOIN users u ON u.id=r.user_id WHERE e.id=? AND u.training_notifications=1 AND r.status IN ('yes','maybe')`).bind(kind,eid);}
export async function flushNotifications(env){
 if(!env.RESEND_API_KEY||!env.MAIL_FROM)return;
 const rows=(await env.DB.prepare("SELECT o.*,u.email,u.training_notifications FROM notification_outbox o JOIN users u ON u.id=o.user_id WHERE o.status IN ('pending','processing') AND o.next_at<=? ORDER BY o.next_at,o.id LIMIT 10").bind(Date.now()).all()).results;
 for(const row of rows){
  if(!row.training_notifications){await env.DB.prepare("DELETE FROM notification_outbox WHERE id=?").bind(row.id).run();continue;}
  const claim=await env.DB.prepare("UPDATE notification_outbox SET status='processing',attempts=attempts+1,next_at=? WHERE id=? AND next_at<=? AND status IN ('pending','processing')").bind(Date.now()+300000,row.id,Date.now()).run();if(!claim.meta.changes)continue;
  let ok=false;try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`training-${row.id}`},body:JSON.stringify({from:env.MAIL_FROM,to:[row.email],subject:`TeamZeit: ${row.kind==='promoted'?'Platz bestätigt':row.kind==='cancelled'?'Training abgesagt':'Training geändert'}`,text:`${row.title}\n${new Intl.DateTimeFormat('de-DE',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(row.start_at))} (Europe/Berlin)\n${row.venue}\n\n${row.kind==='promoted'?'Du bist von der Warteliste auf einen bestätigten Platz nachgerückt.':row.kind==='cancelled'?'Dieser Termin wurde abgesagt.':'Bitte prüfe die aktualisierten Termindaten.'}\n${env.APP_ORIGIN}/#app\nBenachrichtigungen kannst du unter Mein Konto deaktivieren.`}),signal:AbortSignal.timeout(10000)});ok=r.ok;}catch{}
  await env.DB.prepare('UPDATE notification_outbox SET status=?,next_at=? WHERE id=?').bind(ok?'sent':row.attempts>=4?'failed':'pending',Date.now()+Math.min(3600000,300000*2**row.attempts),row.id).run();
 }
}
