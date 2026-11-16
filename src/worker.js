import { HttpError, MAX_TEXT, textField, validEmail, validPassword, validDate, validStatus, safeEqual, publicUser, formatEvent } from './core.js';
import {pbkdf2,scrypt} from 'node:crypto';
import {listEmailInvitations,sendEmailInvitations} from './email-invites.js';

const enc = new TextEncoder();
const pbkdf2Iterations = 210000;
const ttlSessionMs = 7*24*3600*1000;
const ttlInviteMs = 7*24*3600*1000;
const baseHeaders = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'x-frame-options':'DENY',
  'strict-transport-security':'max-age=31536000',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
const json = (payload, status=200, headers={})=>new Response(JSON.stringify(payload),{status,headers:{...baseHeaders,...headers}});
const codeHex = (buf)=>Array.from(new Uint8Array(buf), b=>b.toString(16).padStart(2,'0')).join('');
const randomToken = (size=32)=>codeHex(crypto.getRandomValues(new Uint8Array(size)));
const hashToken = async token=>codeHex(await crypto.subtle.digest('SHA-256',enc.encode(token)));
function registrationAllowed(request, env) {
  const host=new URL(request.url).hostname;
  if(!['localhost','127.0.0.1','[::1]'].includes(host) && env.REGISTRATION_ENABLED!=='true')
    throw new HttpError(503,'Registrierung noch nicht freigeschaltet. Die Demo ist ohne Anmeldung verfügbar.');
}
async function rateLimit(env,key,limit=15,seconds=900,amount=1) {
  const now=Date.now();
  const secret=await crypto.subtle.importKey('raw',enc.encode(env.RATE_LIMIT_SECRET||'local-test-only'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const identifier=codeHex(await crypto.subtle.sign('HMAC',secret,enc.encode(key)));
  const row=await env.DB.prepare(`INSERT INTO request_limits(key,count,expires_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN excluded.count ELSE count+excluded.count END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`)
    .bind(identifier,amount,now+seconds*1000,now,now).first();
  if(row.count>limit)throw new HttpError(429,'Zu viele Anfragen. Bitte später erneut versuchen.');
}
async function hashPassword(password, saltHex, existingHash) {
  const raw = Uint8Array.from(saltHex.match(/.{2}/g), byte=>parseInt(byte,16));
  // Existing local PBKDF2 accounts retain their original password format.
  if(existingHash && !existingHash.startsWith('scrypt-v1$'))
    return new Promise((resolve,reject)=>pbkdf2(password,raw,pbkdf2Iterations,32,'sha256',(error,key)=>error?reject(error):resolve(codeHex(key))));
  // Memory-hard password hashing without Workers' PBKDF2 iteration ceiling.
  return new Promise((resolve,reject)=>scrypt(password,raw,32,{N:16384,r:8,p:5,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve('scrypt-v1$'+codeHex(key))));
}
const params = async request=>{
  if(Number(request.headers.get('content-length')||0)>10000) throw new HttpError(413,'Anfrage zu groß.');
  let body;
  try {
    const reader=request.body?.getReader();let size=0;const chunks=[];
    if(!reader)throw new HttpError(400,'JSON benötigt.');
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>10000){await reader.cancel();throw new HttpError(413,'Anfrage zu groß.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    body=JSON.parse(new TextDecoder().decode(bytes));
  } catch(error) {if(error instanceof HttpError)throw error;throw new HttpError(400,'Ungültiges JSON.');}
  if(!body || Array.isArray(body) || typeof body!=='object') throw new HttpError(400,'Ungültige Eingabe.');
  return body;
};
const pickId = value => {if(!/^[a-f0-9-]{36}$/i.test(value)) throw new HttpError(400,'Ungültige ID.');return value};
const cookie = request => (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('teamzeit_session='))?.split('=')[1]||'';
const cookieAttrs = (request, deleteCookie=false)=>{
  const isSecure=new URL(request.url).protocol==='https:';
  return `teamzeit_session=${deleteCookie?'':cookie(request)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${deleteCookie?0:604800}${isSecure?'; Secure':''}`;
};
function checkOrigin(request) {
  if(!['GET','HEAD','OPTIONS'].includes(request.method)) {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new HttpError(403,'Nicht erlaubter Ursprung.');
    // Cross-site form requests do not carry JSON content types; reject them.
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') throw new HttpError(415,'JSON benötigt.');
  }
}
async function currentUser(request, env) {
  const token=cookie(request);
  if(!/^[0-9a-f]{64}$/.test(token)) return null;
  const digest=await hashToken(token);
  const row=await env.DB.prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at > ?').bind(digest,new Date().toISOString()).first();
  return row||null;
}
async function requireUser(request,env){const user=await currentUser(request,env);if(!user)throw new HttpError(401,'Bitte anmelden.');return user;}
async function membership(env,userId,groupId){
  const row=await env.DB.prepare('SELECT role FROM memberships WHERE group_id=? AND user_id=?').bind(groupId,userId).first();
  if(!row)throw new HttpError(403,'Keine Berechtigung für diese Gruppe.');
  return row.role;
}
async function requireTrainer(env,userId,groupId){const role=await membership(env,userId,groupId);if(role!=='trainer')throw new HttpError(403,'Nur Trainer dürfen dies tun.');}
async function eventWithRole(env,userId,eventId){
  const row=await env.DB.prepare('SELECT group_id FROM training_events WHERE id=?').bind(eventId).first();
  if(!row) throw new HttpError(404,'Termin nicht gefunden.');
  const role=await membership(env,userId,row.group_id);
  return {groupId:row.group_id,role};
}
async function listEvents(env, groupId, userId, role) {
  const result=await env.DB.prepare(`SELECT e.*, r.status AS my_status,
      (SELECT COUNT(*) FROM responses rr WHERE rr.event_id=e.id AND rr.status='yes') AS yes_count,
      (SELECT COUNT(*) FROM responses rr WHERE rr.event_id=e.id AND rr.status='no') AS no_count,
      (SELECT COUNT(*) FROM responses rr WHERE rr.event_id=e.id AND rr.status='maybe') AS maybe_count
      FROM training_events e LEFT JOIN responses r ON r.event_id=e.id AND r.user_id=?
      WHERE e.group_id=? ORDER BY e.start_at ASC LIMIT 150`).bind(userId,groupId).all();
  return result.results.map(x=>formatEvent(x,role==='trainer'));
}
async function attemptLogin(env,email,password) {
  const now=new Date().toISOString();
  const attempt=await env.DB.prepare('SELECT count,first_at,blocked_until FROM login_attempts WHERE email=?').bind(email).first();
  if(attempt?.blocked_until && attempt.blocked_until>now) throw new HttpError(429,'Zu viele Versuche. Bitte später erneut versuchen.');
  const user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  // Hash even on missing user to mitigate simple timing differences.
  const salt=user?.password_salt||'0'.repeat(32);
  const digest=await hashPassword(password,salt,user?.password_hash);
  if(!user || !safeEqual(digest,user.password_hash)) {
    const stale=!attempt || Date.now()-Date.parse(attempt.first_at)>15*60*1000;
    const count=stale?1:attempt.count+1;
    await env.DB.prepare(`INSERT INTO login_attempts(email,count,first_at,blocked_until) VALUES(?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET count=excluded.count,first_at=excluded.first_at,blocked_until=excluded.blocked_until`)
      .bind(email,count,stale?now:attempt.first_at,count>=8?new Date(Date.now()+15*60*1000).toISOString():null).run();
    throw new HttpError(401,'E-Mail oder Passwort ungültig.');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE email=?').bind(email).run();
  return user;
}
async function issueSession(env,user,request) {
  const token=randomToken();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await hashToken(token),user.id,new Date(Date.now()+ttlSessionMs).toISOString()).run();
  const c=`teamzeit_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  return json({user:publicUser(user)},200,{'set-cookie':c});
}
function routeMatch(path,pattern){
  const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);
  if(a.length!==b.length)return null;
  const named={};
  for(let i=0;i<b.length;i++) {if(b[i].startsWith(':'))named[b[i].slice(1)]=a[i]; else if(a[i]!==b[i])return null;}
  return named;
}
async function api(request,env) {
  checkOrigin(request);
  const u=new URL(request.url);const path=u.pathname;const method=request.method;
  if(method==='POST' && ['/api/setup','/api/auth/login','/api/auth/register','/api/auth/forgot-password','/api/auth/reset-password'].includes(path)) {
    await rateLimit(env,`auth:${request.headers.get('cf-connecting-ip')||'local'}:${path}`,30);
  }
  if(method==='GET'&&path==='/api/health') return json({status:'ok',app:'TeamZeit',version:'1.0.0'});
  if(method==='POST'&&path==='/api/invites/preview') {
    await rateLimit(env,`invite-preview:${request.headers.get('cf-connecting-ip')||'local'}`,60);
    const data=await params(request),raw=String(data.inviteCode||'').replaceAll('-','').trim().toLowerCase();
    if(!/^[0-9a-f]{32}$/.test(raw))throw new HttpError(400,'Ungültige Einladung.');
    const row=await env.DB.prepare('SELECT i.recipient_email,i.expires_at,g.name FROM invitations i JOIN groups g ON g.id=i.group_id WHERE i.token_hash=? AND i.expires_at>? AND i.uses<i.max_uses').bind(await hashToken(raw),new Date().toISOString()).first();
    if(!row)throw new HttpError(400,'Einladung ungültig, abgelaufen oder bereits angenommen.');
    return json({email:row.recipient_email,groupName:row.name,expiresAt:row.expires_at});
  }
  if(method==='GET'&&path==='/api/setup/status') {
    const result=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return json({initialized:result.n>0,registrationEnabled:env.REGISTRATION_ENABLED==='true'||['localhost','127.0.0.1'].includes(u.hostname),recoveryEnabled:!!(env.RESEND_API_KEY&&env.MAIL_FROM&&env.APP_ORIGIN)});
  }
  if(method==='POST'&&path==='/api/setup') {
    if(!env.SETUP_TOKEN || env.SETUP_TOKEN.length<20)throw new HttpError(503,'SETUP_TOKEN muss als Wrangler Secret gesetzt werden.');
    const data=await params(request);
    if(!safeEqual(await hashToken(String(data.setupToken||'')),await hashToken(env.SETUP_TOKEN)))throw new HttpError(403,'Ungültiger Einrichtungscode.');
    const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if(n.n!==0)throw new HttpError(409,'App bereits eingerichtet.');
    const name=textField(data.name,'Name',MAX_TEXT.name),email=validEmail(data.email),password=validPassword(data.password);
    const groupName=textField(data.groupName||'Die wilden Waden','Gruppenname',MAX_TEXT.group);
    const uid=crypto.randomUUID(),gid=crypto.randomUUID(),salt=randomToken(16),digest=await hashPassword(password,salt);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO setup_lock(id) VALUES(1)'),
      env.DB.prepare('INSERT INTO users(id,name,email,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(uid,name,email,digest,salt),
      env.DB.prepare('INSERT INTO groups(id,name,description,created_by) VALUES(?,?,?,?)').bind(gid,groupName,'Trainingsorganisation für eine Freizeitsportgruppe',uid),
      env.DB.prepare('INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,?)').bind(gid,uid,'trainer')
    ]);
    return issueSession(env,{id:uid,name,email},request);
  }
  if(method==='POST'&&path==='/api/auth/login') {
    const data=await params(request);const email=validEmail(data.email);
    if(typeof data.password!=='string'||data.password.length>256)throw new HttpError(400,'Ungültiges Passwort.');
    return issueSession(env,await attemptLogin(env,email,data.password),request);
  }
  if(method==='POST'&&path==='/api/auth/register') {
    registrationAllowed(request,env);
    const data=await params(request);
    if(data.privacyAccepted!==true)throw new HttpError(400,'Bitte die Datenschutzhinweise bestätigen.');
    const name=textField(data.name,'Name',MAX_TEXT.name),email=validEmail(data.email),password=validPassword(data.password);
    const raw=String(data.inviteCode||'').replaceAll('-','').trim().toLowerCase();
    if(!/^[0-9a-f]{32}$/.test(raw))throw new HttpError(400,'Ungültiger Einladungscode.');
    const hash=await hashToken(raw),now=new Date().toISOString();
    const invite=await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND uses<max_uses').bind(hash,now).first();
    if(!invite)throw new HttpError(400,'Einladung ungültig, abgelaufen oder aufgebraucht.');
    if(invite.recipient_email&&invite.recipient_email!==email)throw new HttpError(403,'Diese persönliche Einladung gilt für eine andere E-Mail-Adresse.');
    const uid=crypto.randomUUID(),salt=randomToken(16),digest=await hashPassword(password,salt);
    try {await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,name,email,password_hash,password_salt) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND uses<max_uses AND (recipient_email IS NULL OR recipient_email=?))`).bind(uid,name,email,digest,salt,hash,email),
      env.DB.prepare('INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,?)').bind(invite.group_id,uid,invite.role),
      env.DB.prepare('UPDATE invitations SET uses=uses+1,accepted_at=CASE WHEN recipient_email IS NOT NULL THEN ? ELSE accepted_at END,accepted_by=CASE WHEN recipient_email IS NOT NULL THEN ? ELSE accepted_by END WHERE token_hash=?').bind(now,uid,hash)
    ]);} catch {throw new HttpError(409,'Registrierung nicht möglich; E-Mail eventuell bereits verwendet.');}
    return issueSession(env,{id:uid,name,email},request);
  }
  if(method==='POST'&&path==='/api/auth/forgot-password') {
    if(!env.RESEND_API_KEY || !env.MAIL_FROM || !env.APP_ORIGIN)throw new HttpError(503,'Passwort-Wiederherstellung ist noch nicht eingerichtet. Bitte den Betreiber kontaktieren.');
    const data=await params(request),email=validEmail(data.email);
    await rateLimit(env,`reset:${email}`,3,3600);
    const user=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if(user){
      const token=randomToken(),digest=await hashToken(token);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(user.id),
        env.DB.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest,user.id,new Date(Date.now()+30*60000).toISOString())
      ]);
      const link=new URL('/',env.APP_ORIGIN);link.hash=`reset=${token}`;
      const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'TeamZeit: Passwort zurücksetzen',text:`Passwort zurücksetzen (30 Minuten gültig):\n${link.href}\n\nWenn Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht.`})});
      if(!result.ok){await env.DB.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(digest).run();console.error('Password recovery delivery failed');}
    }
    return json({ok:true,message:'Falls ein Konto existiert, erhalten Sie einen Link per E-Mail.'});
  }
  if(method==='POST'&&path==='/api/auth/reset-password') {
    const data=await params(request),password=validPassword(data.password);
    if(typeof data.token!=='string'||!/^[0-9a-f]{64}$/.test(data.token))throw new HttpError(400,'Ungültiger Link.');
    const tokenHash=await hashToken(data.token),now=new Date().toISOString();
    const reset=await env.DB.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?').bind(tokenHash,now).first();
    if(!reset)throw new HttpError(400,'Link ungültig oder abgelaufen.');
    const salt=randomToken(16),digest=await hashPassword(password,salt);
    // Read the token inside each update. A simultaneous replay cannot overwrite the password.
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=(SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?)').bind(digest,salt,tokenHash,now),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=(SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?)').bind(tokenHash,now),
      env.DB.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(tokenHash),
      env.DB.prepare('DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=?)').bind(reset.user_id)
    ]);
    return json({ok:true},200,{'set-cookie':cookieAttrs(request,true)});
  }
  if(method==='POST'&&path==='/api/auth/logout') {
    const token=cookie(request);
    if(token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(token)).run();
    return json({ok:true},200,{'set-cookie':cookieAttrs(request,true)});
  }
  if(method==='GET'&&path==='/api/me') {
    const user=await requireUser(request,env);
    const groups=await env.DB.prepare('SELECT g.id,g.name,g.description,m.role FROM groups g JOIN memberships m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at').bind(user.id).all();
    return json({user:publicUser(user),groups:groups.results});
  }
  if(method==='DELETE'&&path==='/api/me') {
    const user=await requireUser(request,env);
    const trainerGroups=await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships m WHERE m.user_id=? AND m.role='trainer' AND NOT EXISTS(SELECT 1 FROM memberships m2 WHERE m2.group_id=m.group_id AND m2.user_id<>m.user_id AND m2.role='trainer')").bind(user.id).first();
    if(trainerGroups.n)throw new HttpError(409,'Zuerst eine weitere Trainerperson festlegen oder die Gruppe löschen.');
    await env.DB.batch([
      env.DB.prepare("UPDATE groups SET created_by=(SELECT user_id FROM memberships WHERE group_id=groups.id AND role='trainer' AND user_id<>? LIMIT 1) WHERE created_by=?").bind(user.id,user.id),
      env.DB.prepare('UPDATE training_events SET created_by=(SELECT created_by FROM groups WHERE id=training_events.group_id) WHERE created_by=?').bind(user.id),
      env.DB.prepare('UPDATE invitations SET created_by=(SELECT created_by FROM groups WHERE id=invitations.group_id) WHERE created_by=?').bind(user.id),
      env.DB.prepare('DELETE FROM invitations WHERE recipient_email=?').bind(user.email),
      env.DB.prepare('DELETE FROM users WHERE id=?').bind(user.id)
    ]);
    return json({ok:true},200,{'set-cookie':cookieAttrs(request,true)});
  }
  const user=await requireUser(request,env);
  if(path==='/api/me/export'&&method==='GET') {
    const groups=await env.DB.prepare('SELECT g.name,m.role,m.joined_at FROM memberships m JOIN groups g ON g.id=m.group_id WHERE m.user_id=?').bind(user.id).all();
    const responses=await env.DB.prepare('SELECT e.title,e.start_at,r.status,r.updated_at FROM responses r JOIN training_events e ON e.id=r.event_id WHERE r.user_id=?').bind(user.id).all();
    return json({user:publicUser(user),groups:groups.results,responses:responses.results});
  }
  if(path==='/api/groups'&&method==='POST') {
    const data=await params(request),id=crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO groups(id,name,description,created_by) VALUES(?,?,?,?)').bind(id,textField(data.name,'Gruppenname',MAX_TEXT.group),textField(data.description||'','Beschreibung',800,false),user.id),
      env.DB.prepare("INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,'trainer')").bind(id,user.id)
    ]);return json({id},201);
  }
  if(path==='/api/groups/join'&&method==='POST') {
    const data=await params(request),raw=String(data.inviteCode||'').replaceAll('-','').trim().toLowerCase();
    if(!/^[0-9a-f]{32}$/.test(raw))throw new HttpError(400,'Ungültiger Einladungscode.');
    const hash=await hashToken(raw),invite=await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND uses<max_uses').bind(hash,new Date().toISOString()).first();
    if(!invite)throw new HttpError(400,'Einladung ungültig oder abgelaufen.');
    if(invite.recipient_email&&invite.recipient_email!==user.email)throw new HttpError(403,'Bitte mit der eingeladenen E-Mail-Adresse anmelden.');
    const existing=await env.DB.prepare('SELECT role FROM memberships WHERE group_id=? AND user_id=?').bind(invite.group_id,user.id).first();
    if(existing){
      if(invite.recipient_email){try{
        const changed=await env.DB.prepare('UPDATE invitations SET uses=uses+1,accepted_at=?,accepted_by=? WHERE token_hash=?').bind(new Date().toISOString(),user.id,hash).run();
        if(!changed.meta.changes)throw new Error('Invitation changed');
      }catch{throw new HttpError(409,'Einladung wurde inzwischen angenommen oder geändert. Bitte aktualisieren.');}}
      return json({id:invite.group_id});
    }
    try{const joined=await env.DB.batch([
      env.DB.prepare(`INSERT INTO memberships(group_id,user_id,role) SELECT group_id,?,role FROM invitations WHERE token_hash=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND uses<max_uses AND (recipient_email IS NULL OR recipient_email=?)`).bind(user.id,hash,user.email),
      env.DB.prepare('UPDATE invitations SET uses=uses+1,accepted_at=CASE WHEN recipient_email IS NOT NULL THEN ? ELSE accepted_at END,accepted_by=CASE WHEN recipient_email IS NOT NULL THEN ? ELSE accepted_by END WHERE token_hash=?').bind(new Date().toISOString(),user.id,hash)
    ]);if(!joined[0].meta.changes)throw new Error('Invitation changed');
    }catch{throw new HttpError(409,'Einladung wurde inzwischen angenommen oder geändert. Bitte aktualisieren.');}
    return json({id:invite.group_id});
  }
  let groupRoute=routeMatch(path,'/api/groups/:groupId');
  if(groupRoute&&['PATCH','DELETE'].includes(method)) {
    const gid=pickId(groupRoute.groupId);await requireTrainer(env,user.id,gid);
    if(method==='PATCH'){
      const data=await params(request);
      await env.DB.prepare('UPDATE groups SET name=?,description=? WHERE id=?').bind(textField(data.name,'Gruppenname',MAX_TEXT.group),textField(data.description||'','Beschreibung',800,false),gid).run();return json({ok:true});
    }
    await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(gid).run();return json({ok:true});
  }
  groupRoute=routeMatch(path,'/api/groups/:groupId/members/:userId');
  if(groupRoute&&['PATCH','DELETE'].includes(method)) {
    const gid=pickId(groupRoute.groupId),uid=pickId(groupRoute.userId);await requireTrainer(env,user.id,gid);
    if(uid===user.id)throw new HttpError(409,'Die eigene Trainerrolle kann hier nicht entfernt werden.');
    if(method==='PATCH'){
      const data=await params(request);if(!['trainer','member'].includes(data.role))throw new HttpError(400,'Ungültige Rolle.');
      const result=await env.DB.prepare('UPDATE memberships SET role=? WHERE group_id=? AND user_id=?').bind(data.role,gid,uid).run();
      if(!result.meta.changes)throw new HttpError(404,'Mitglied nicht gefunden.');
    }else await env.DB.batch([
      env.DB.prepare('DELETE FROM responses WHERE user_id=? AND event_id IN (SELECT id FROM training_events WHERE group_id=?)').bind(uid,gid),
      env.DB.prepare('DELETE FROM memberships WHERE group_id=? AND user_id=?').bind(gid,uid)
    ]);
    return json({ok:true});
  }
  let route=routeMatch(path,'/api/groups/:groupId/email-invites');
  if(route&&['GET','POST'].includes(method)){
    const groupId=pickId(route.groupId);await requireTrainer(env,user.id,groupId);
    if(method==='GET')return json({invitations:await listEmailInvitations(env,groupId)});
    return json(await sendEmailInvitations({request,env,user,groupId,data:await params(request),rateLimit}));
  }
  route=routeMatch(path,'/api/groups/:groupId/email-invites/:inviteId/resend');
  if(route&&method==='POST'){
    const groupId=pickId(route.groupId);await requireTrainer(env,user.id,groupId);
    return json(await sendEmailInvitations({request,env,user,groupId,inviteId:pickId(route.inviteId),data:await params(request),rateLimit}));
  }
  route=routeMatch(path,'/api/groups/:groupId/events');
  if(route) {
    const gid=pickId(route.groupId);const role=await membership(env,user.id,gid);
    if(method==='GET')return json({events:await listEvents(env,gid,user.id,role)});
    if(method==='POST') {
      if(role!=='trainer')throw new HttpError(403,'Nur Trainer dürfen Termine anlegen.');
      const data=await params(request);const id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO training_events(id,group_id,title,start_at,location,notes,created_by) VALUES(?,?,?,?,?,?,?)')
        .bind(id,gid,textField(data.title,'Titel',MAX_TEXT.title),validDate(data.startAt),textField(data.location,'Ort',MAX_TEXT.location),textField(data.notes||'','Hinweise',MAX_TEXT.notes,false),user.id).run();
      return json({id},201);
    }
  }
  route=routeMatch(path,'/api/groups/:groupId/invites');
  if(route&&method==='POST') {
    const gid=pickId(route.groupId);await requireTrainer(env,user.id,gid);
    const data=await params(request);const role=data.role||'member';
    if(!['member','trainer'].includes(role))throw new HttpError(400,'Ungültige Einladungsrolle.');
    const raw=randomToken(16),expiresAt=new Date(Date.now()+ttlInviteMs).toISOString();
    await env.DB.prepare('INSERT INTO invitations(token_hash,group_id,role,expires_at,max_uses,created_by) VALUES(?,?,?,?,?,?)')
      .bind(await hashToken(raw),gid,role,expiresAt,role==='trainer'?1:25,user.id).run();
    return json({inviteCode:raw,inviteUrl:`${env.APP_ORIGIN||u.origin}/#invite=${raw}`,expiresAt,maxUses:role==='trainer'?1:25},201);
  }
  route=routeMatch(path,'/api/groups/:groupId/members');
  if(route&&method==='GET') {
    const gid=pickId(route.groupId);await requireTrainer(env,user.id,gid);
    const data=await env.DB.prepare('SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.name').bind(gid).all();
    return json({members:data.results});
  }
  route=routeMatch(path,'/api/events/:eventId');
  if(route&&(method==='PATCH'||method==='DELETE')) {
    const eid=pickId(route.eventId);const {groupId,role}=await eventWithRole(env,user.id,eid);
    if(role!=='trainer')throw new HttpError(403,'Nur Trainer dürfen Termine bearbeiten.');
    if(method==='DELETE'){await env.DB.prepare('DELETE FROM training_events WHERE id=? AND group_id=?').bind(eid,groupId).run();return json({ok:true});}
    const data=await params(request);
    await env.DB.prepare('UPDATE training_events SET title=?,start_at=?,location=?,notes=? WHERE id=?')
      .bind(textField(data.title,'Titel',MAX_TEXT.title),validDate(data.startAt),textField(data.location,'Ort',MAX_TEXT.location),textField(data.notes||'','Hinweise',MAX_TEXT.notes,false),eid).run();
    return json({ok:true});
  }
  route=routeMatch(path,'/api/events/:eventId/rsvp');
  if(route&&method==='POST') {
    const eid=pickId(route.eventId);await eventWithRole(env,user.id,eid);
    const data=await params(request);
    if(data.status===null) await env.DB.prepare('DELETE FROM responses WHERE event_id=? AND user_id=?').bind(eid,user.id).run();
    else await env.DB.prepare(`INSERT INTO responses(event_id,user_id,status,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
      .bind(eid,user.id,validStatus(data.status),new Date().toISOString()).run();
    return json({ok:true});
  }
  route=routeMatch(path,'/api/events/:eventId/participants');
  if(route&&method==='GET') {
    const eid=pickId(route.eventId);const {groupId,role}=await eventWithRole(env,user.id,eid);
    if(role!=='trainer')throw new HttpError(403,'Teilnehmerlisten sind nur für Trainer sichtbar.');
    const people=await env.DB.prepare(`SELECT u.name, m.role, COALESCE(r.status,'open') AS status
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN responses r ON r.user_id=u.id AND r.event_id=?
      WHERE m.group_id=? ORDER BY u.name`).bind(eid,groupId).all();
    return json({participants:people.results});
  }
  throw new HttpError(404,'Nicht gefunden.');
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname)){
      url.protocol='https:';return Response.redirect(url.href,308);
    }
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/')) {
      const response=await env.ASSETS.fetch(request);
      const headers=new Headers(response.headers);
      headers.set('x-content-type-options','nosniff');
      headers.set('strict-transport-security','max-age=31536000');
      headers.set('referrer-policy','strict-origin-when-cross-origin');
      headers.set('x-frame-options','DENY');
      headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
      headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
      return new Response(response.body,{status:response.status,headers});
    }
    try{return await api(request,env)}
    catch(err){
      if(err instanceof HttpError) return json({error:err.message},err.status);
      console.error('TeamZeit API error',err);
      return json({error:'Interner Serverfehler.'},500);
    }
  },
  async scheduled(controller,env) {
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM password_resets WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM invitations WHERE (recipient_email IS NULL AND expires_at<=?) OR (recipient_email IS NOT NULL AND expires_at<=?)').bind(now,new Date(Date.now()-30*86400000).toISOString()),
      env.DB.prepare('DELETE FROM request_limits WHERE expires_at<=?').bind(Date.now()),
      env.DB.prepare('DELETE FROM login_attempts WHERE first_at<? AND (blocked_until IS NULL OR blocked_until<?)').bind(new Date(Date.now()-86400000).toISOString(),now)
    ]);
  }
};
