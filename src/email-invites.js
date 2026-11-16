import {HttpError,validEmail} from './core.js';

export function invitationRecipients(value){
 if(typeof value==='string'&&value.length>6000)throw new HttpError(400,'Zu viele Eingaben.');
 const values=typeof value==='string'?value.split(/[\s,;]+/).filter(Boolean):value;
 if(!Array.isArray(values)||!values.length||values.length>40)throw new HttpError(400,'Bitte 1 bis 20 E-Mail-Adressen eingeben.');
 const emails=[...new Set(values.map(validEmail))];
 if(emails.length>20)throw new HttpError(400,'Höchstens 20 Empfänger pro Versand.');
 return emails;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invitationMessage({from,email,trainer,group,url,expiresAt,origin}){
 const expires=new Intl.DateTimeFormat('de-DE',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(expiresAt));
 return {from,to:[email],subject:`${trainer} lädt dich zu ${group} ein`,
  text:`Hallo,\n\n${trainer} lädt dich zur Gruppe „${group}“ bei TeamZeit ein.\n\nEinladung annehmen: ${url}\n\nRegistriere dich mit ${email}, oder melde dich mit diesem Konto an. Danach bist du automatisch Mitglied der Gruppe. Dieser persönliche Link gilt einmalig bis ${expires} Uhr (Europe/Berlin).\n\nFalls du keine Einladung erwartet hast, ignoriere diese Nachricht.\nDatenschutz: ${origin}/datenschutz.html`,
  html:`<!doctype html><html lang="de"><body style="margin:0;background:#f3f7f3;font-family:Arial,sans-serif;color:#18352a"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:16px"><p style="font-weight:bold;letter-spacing:2px">TEAMZEIT</p><h1 style="font-size:26px">Gemeinsam trainieren.</h1><p>Hallo,</p><p><strong>${escape(trainer)}</strong> lädt dich zur Gruppe <strong>${escape(group)}</strong> ein.</p><p style="margin:28px 0"><a href="${escape(url)}" style="background:#b5ed80;color:#173522;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:bold;display:inline-block">Einladung annehmen</a></p><p>Registriere dich mit <strong>${escape(email)}</strong> oder melde dich mit diesem Konto an. Du trittst danach automatisch der Gruppe bei.</p><p>Einmalig gültig bis ${escape(expires)} Uhr (Europe/Berlin).</p><p style="font-size:13px;color:#586c61">Falls du keine Einladung erwartet hast, ignoriere diese Nachricht. <a href="${escape(origin)}/datenschutz.html">Datenschutz</a></p></div></body></html>`};
}
export async function listEmailInvitations(env,groupId){
 const rows=await env.DB.prepare('SELECT id,recipient_email,expires_at,accepted_at,delivery_status,last_sent_at,send_attempted_at,send_window_at,send_count FROM invitations WHERE group_id=? AND recipient_email IS NOT NULL ORDER BY created_at DESC LIMIT 100').bind(groupId).all();
 return rows.results.map(row=>({id:row.id,email:row.recipient_email,expiresAt:row.expires_at,acceptedAt:row.accepted_at,lastSentAt:row.last_sent_at,
  status:row.accepted_at?'accepted':row.expires_at<=new Date().toISOString()?'expired':'pending',deliveryStatus:row.delivery_status,
  canResend:!row.accepted_at&&(!row.send_attempted_at||Date.now()-Date.parse(row.send_attempted_at)>=60000)&&(!row.send_window_at||Date.now()-Date.parse(row.send_window_at)>=86400000||row.send_count<5)}));
}
export async function sendEmailInvitations({request,env,user,groupId,data,inviteId,rateLimit}){
 if(!env.RESEND_API_KEY||!env.MAIL_FROM||!env.APP_ORIGIN)throw new HttpError(503,'E-Mail-Versand ist noch nicht eingerichtet.');
 let emails;
 if(inviteId){
  const invitation=await env.DB.prepare('SELECT recipient_email,accepted_at FROM invitations WHERE id=? AND group_id=?').bind(inviteId,groupId).first();
  if(!invitation?.recipient_email)throw new HttpError(404,'Einladung nicht gefunden.');
  if(invitation.accepted_at)throw new HttpError(409,'Diese Einladung wurde bereits angenommen.');
  emails=[invitation.recipient_email];
 }else emails=invitationRecipients(data.emails);
 const days=Number(data.expiresInDays??7);if(![1,3,7].includes(days))throw new HttpError(400,'Gültigkeit: 1, 3 oder 7 Tage.');
 await rateLimit(env,`invite-trainer:${user.id}`,20,3600);
 await rateLimit(env,`invite-group:${groupId}`,100,86400,emails.length);
 const group=await env.DB.prepare('SELECT name FROM groups WHERE id=?').bind(groupId).first();
 const now=new Date().toISOString(),cutoff=new Date(Date.now()-60000).toISOString(),expiresAt=new Date(Date.now()+days*86400000).toISOString();
 const placeholders=emails.map(()=>'?').join(',');
 const memberRows=await env.DB.prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND u.email IN (${placeholders})`).bind(groupId,...emails).all();
 const members=new Set(memberRows.results.map(x=>x.email));
 const existingRows=await env.DB.prepare(`SELECT id,recipient_email,token_hash,accepted_at,send_attempted_at,send_window_at,send_count FROM invitations WHERE group_id=? AND recipient_email IN (${placeholders})`).bind(groupId,...emails).all();
 const existingByEmail=new Map(existingRows.results.map(x=>[x.recipient_email,x]));
 const prepared=[],results=[];
 for(const email of emails){
  if(members.has(email)){results.push({email,status:'already_member'});continue;}
  const existing=existingByEmail.get(email);
  if(existing?.send_attempted_at&&existing.send_attempted_at>cutoff){results.push({email,status:'cooldown'});continue;}
  const freshWindow=!existing?.send_window_at||Date.now()-Date.parse(existing.send_window_at)>=86400000;
  if(!freshWindow&&existing.send_count>=5){results.push({email,status:'daily_limit'});continue;}
  const sendCount=freshWindow?1:existing.send_count+1,sendWindow=freshWindow?now:existing.send_window_at;
  const raw=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const id=existing?.id||crypto.randomUUID();
  let saved;
  if(existing){
   saved=await env.DB.prepare(`UPDATE invitations SET token_hash=?,role='member',expires_at=?,max_uses=1,uses=0,accepted_at=NULL,accepted_by=NULL,delivery_status='pending',last_sent_at=NULL,send_attempted_at=?,provider_id=NULL,created_by=?,created_at=?,send_count=?,send_window_at=? WHERE id=? AND token_hash=? AND accepted_at IS ? AND (send_attempted_at IS NULL OR send_attempted_at<=?)`)
    .bind(digest,expiresAt,now,user.id,now,sendCount,sendWindow,id,existing.token_hash,existing.accepted_at,cutoff).run();
  }else{
   saved=await env.DB.prepare(`INSERT INTO invitations(token_hash,group_id,role,expires_at,max_uses,created_by,id,recipient_email,delivery_status,send_attempted_at,created_at,send_count,send_window_at) VALUES(?,?,'member',?,1,?,?,?,'pending',?,?,?,?) ON CONFLICT(group_id,recipient_email) WHERE recipient_email IS NOT NULL DO NOTHING`)
    .bind(digest,groupId,expiresAt,user.id,id,email,now,now,sendCount,sendWindow).run();
  }
  if(!saved.meta.changes){results.push({email,status:'changed'});continue;}
  prepared.push({id,email,digest,message:invitationMessage({from:env.MAIL_FROM,email,trainer:user.name,group:group.name,url:`${env.APP_ORIGIN}/#invite=${raw}`,expiresAt,origin:env.APP_ORIGIN})});
 }
 if(prepared.length){
  let delivered;
  try{
   const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`teamzeit-invites-${crypto.randomUUID()}`},body:JSON.stringify(prepared.map(item=>item.message)),signal:AbortSignal.timeout(15000)});
   if(response.ok){const body=await response.json();if(Array.isArray(body.data)&&body.data.length===prepared.length&&body.data.every(x=>typeof x.id==='string'))delivered=body.data;}
  }catch{/* No recipient addresses, raw tokens or provider credentials in logs. */}
  for(let i=0;i<prepared.length;i++){
   const item=prepared[i],sent=!!delivered;
   await env.DB.prepare('UPDATE invitations SET delivery_status=?,last_sent_at=?,provider_id=? WHERE id=? AND token_hash=?').bind(sent?'sent':'failed',sent?new Date().toISOString():null,sent?delivered[i].id:null,item.id,item.digest).run();
   results.push({email:item.email,status:sent?'sent':'failed'});
  }
 }
 return {results,invitations:await listEmailInvitations(env,groupId)};
}
