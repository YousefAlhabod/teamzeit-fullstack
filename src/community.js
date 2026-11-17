import {HttpError,textField,validEmail} from './core.js';
export const projectId='00000000-0000-4000-8000-000000000002';
const roles=['project_admin','product_owner','scrum_master','developer','stakeholder'];
const statuses=['todo','in_progress','review','done'];
export async function verificationMail(env,user,hashToken,randomToken){
 if(!env.RESEND_API_KEY||!env.MAIL_FROM||!env.APP_ORIGIN)throw new HttpError(503,'E-Mail-Verifizierung ist derzeit nicht verfügbar.');
 const token=randomToken(),hash=await hashToken(token),now=new Date().toISOString();
 await env.DB.prepare('INSERT INTO email_verifications(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=excluded.created_at').bind(hash,user.id,new Date(Date.now()+86400000).toISOString(),now).run();
 let sent=false;try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`verify-${hash}`},body:JSON.stringify({from:env.MAIL_FROM,to:[user.email],subject:'TeamZeit: E-Mail-Adresse bestätigen',text:`Bitte bestätige deine E-Mail-Adresse für TeamZeit:\n${env.APP_ORIGIN}/#verify=${token}\n\nDer Link gilt einmalig für 24 Stunden. Falls du kein Konto angelegt hast, ignoriere diese Nachricht.\nDatenschutz: ${env.APP_ORIGIN}/datenschutz.html`}),signal:AbortSignal.timeout(15000)});sent=r.ok;}catch{}
 return sent;
}
export async function scrumRole(env,uid,pid){return (await env.DB.prepare('SELECT role FROM scrum_members WHERE project_id=? AND user_id=?').bind(pid,uid).first())?.role||null;}
export async function scrumApi({env,user,path,method,data,id,json}){
 if(path==='/api/scrum/projects'&&method==='GET')return json({projects:(await env.DB.prepare('SELECT p.id,p.name,m.role FROM scrum_projects p JOIN scrum_members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.name').bind(user.id).all()).results});
 const match=path.match(/^\/api\/scrum\/projects\/([a-f0-9-]{36})(?:\/(members|tasks)(?:\/([a-f0-9-]{36}))?)?$/i);if(!match)return null;
 const pid=id(match[1]),section=match[2],item=match[3]?id(match[3]):null,role=await scrumRole(env,user.id,pid);
 if(!role)throw new HttpError(403,'Keine Projektmitgliedschaft. Sportrollen vergeben keine Scrum-Rechte.');
 const manage=['project_admin','product_owner','scrum_master'].includes(role);
 if(section==='members'&&method==='GET'&&!item)return json({members:(await env.DB.prepare('SELECT u.id,u.name,m.role FROM scrum_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.name,u.id LIMIT 1000').bind(pid).all()).results});
 if(section==='members'&&method==='POST'){
  if(role!=='project_admin')throw new HttpError(403,'Nur Projektadministratoren vergeben Scrum-Rollen.');
  const d=await data();if(!roles.includes(d.role))throw new HttpError(400,'Ungültige Projektrolle.');
  const target=await env.DB.prepare('SELECT id FROM users WHERE email=? AND (verification_required=0 OR email_verified_at IS NOT NULL)').bind(validEmail(d.email)).first();if(!target)throw new HttpError(404,'Registriertes, freigeschaltetes Konto nicht gefunden.');
  try{await env.DB.prepare('INSERT INTO scrum_members(project_id,user_id,role) VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role').bind(pid,target.id,d.role).run();}catch{throw new HttpError(409,'Die letzte Projektadministration muss erhalten bleiben.');}return json({ok:true});
 }
 if(section==='members'&&item&&method==='DELETE'){
  if(role!=='project_admin')throw new HttpError(403,'Nur Projektadministratoren.');
  try{await env.DB.batch([env.DB.prepare('DELETE FROM scrum_members WHERE project_id=? AND user_id=?').bind(pid,item),env.DB.prepare('UPDATE scrum_tasks SET assignee_id=NULL,version=version+1,updated_at=? WHERE project_id=? AND assignee_id=?').bind(new Date().toISOString(),pid,item)]);}catch{throw new HttpError(409,'Die letzte Projektadministration muss erhalten bleiben.');}return json({ok:true});
 }
 if(section==='tasks'&&method==='GET'&&!item)return json({tasks:(await env.DB.prepare('SELECT id,title,description,status,assignee_id AS assigneeId,version,created_at AS createdAt,updated_at AS updatedAt FROM scrum_tasks WHERE project_id=? ORDER BY updated_at DESC,id LIMIT 500').bind(pid).all()).results});
 if(section==='tasks'&&method==='POST'&&!item){
  if(!manage)throw new HttpError(403,'Nur Projektadministration, Product Owner oder Scrum Master legen Aufgaben an.');
  const d=await data(),tid=crypto.randomUUID(),now=new Date().toISOString(),assignee=d.assigneeId?id(d.assigneeId):null;
  if(!assignee)throw new HttpError(400,'Bitte eine zuständige Person auswählen.');
  if(assignee&&!await scrumRole(env,assignee,pid))throw new HttpError(400,'Zuständige Person gehört nicht zu diesem Projekt.');
  await env.DB.prepare('INSERT INTO scrum_tasks(id,project_id,title,description,assignee_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(tid,pid,textField(d.title,'Titel',140),textField(d.description,'Beschreibung',2000),assignee,user.id,now,now).run();return json({id:tid},201);
 }
 if(section==='tasks'&&item&&['PATCH','DELETE'].includes(method)){
  const task=await env.DB.prepare('SELECT * FROM scrum_tasks WHERE id=? AND project_id=?').bind(item,pid).first();if(!task)throw new HttpError(404,'Aufgabe nicht gefunden.');
  if(method==='DELETE'){if(!manage)throw new HttpError(403,'Keine Berechtigung.');await env.DB.prepare('DELETE FROM scrum_tasks WHERE id=? AND project_id=?').bind(item,pid).run();return json({ok:true});}
  const d=await data();if(!manage&&(role!=='developer'||task.assignee_id!==user.id||Object.keys(d).some(k=>!['status','version'].includes(k))))throw new HttpError(403,'Nur zugewiesene eigene Aufgaben dürfen im Status geändert werden.');
  if(!Number.isInteger(d.version)||!statuses.includes(d.status??task.status))throw new HttpError(400,'Status und aktuelle Version benötigt.');
  const assignee=d.assigneeId===undefined?task.assignee_id:d.assigneeId?id(d.assigneeId):null;
  if(assignee&&!await scrumRole(env,assignee,pid))throw new HttpError(400,'Zuständige Person gehört nicht zum Projekt.');
  const r=await env.DB.prepare('UPDATE scrum_tasks SET title=?,description=?,status=?,assignee_id=?,version=version+1,updated_at=? WHERE id=? AND project_id=? AND version=?').bind(d.title===undefined?task.title:textField(d.title,'Titel',140),d.description===undefined?task.description:textField(d.description,'Beschreibung',2000,false),d.status??task.status,assignee,new Date().toISOString(),item,pid,d.version).run();if(!r.meta.changes)throw new HttpError(409,'Aufgabe wurde inzwischen geändert. Bitte aktualisieren.');return json({ok:true});
 }
 throw new HttpError(404,'Nicht gefunden.');
}
