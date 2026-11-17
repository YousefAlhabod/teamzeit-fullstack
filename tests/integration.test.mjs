import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('real Worker + isolated D1: four accounts, permissions, invitations, persistence and recovery',async()=>{
 const verificationMails=new Map();
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/core.js'},{type:'ESModule',path:'src/community.js'},{type:'ESModule',path:'src/email-invites.js'},{type:'ESModule',path:'src/platform.js'},{type:'ESModule',path:'src/project-page.js'},{type:'ESModule',path:'public/time.js'}],compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{SETUP_TOKEN:'test-only-setup-token-123456789',RESEND_API_KEY:'mock-no-real-mail',MAIL_FROM:'TeamZeit <test@example.invalid>',APP_ORIGIN:'https://test.example.invalid'},outboundService:async request=>{const mail=await request.json();if(mail.subject.includes('bestätigen'))verificationMails.set(mail.to[0],mail.text.match(/#verify=([a-f0-9]{64})/)[1]);return Response.json({id:'mock'});}}));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of readdirSync('migrations').sort()){
   // D1 exec expects one statement per line; prepare handles trigger bodies intact.
   const sql=readFileSync(`migrations/${name}`,'utf8').replace(/--[^\n]*/g,'');
   const statements=sql.trim().match(/CREATE TRIGGER[\s\S]*?END;|[^;]+;/g)||[];
   // Whitespace before CREATE TRIGGER must not let the ordinary-statement branch split it.
   const combined=[];for(let i=0;i<statements.length;i++){
    let statement=statements[i];if(statement.includes('CREATE TRIGGER')&&!statement.includes('END;'))statement+=statements[++i];combined.push(statement);
   }
   for(const statement of combined)await db.prepare(statement).run();
  }
  const clients=Array.from({length:5},()=>({cookie:''}));
  async function req(client,path,method='GET',body,expected=200){
   const headers={};if(client.cookie)headers.cookie=client.cookie;
   if(body!==undefined)headers['content-type']='application/json';
   const res=await mf.dispatchFetch(`http://localhost/api${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   const data=await res.json();assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);
   if(res.headers.has('set-cookie'))client.cookie=res.headers.get('set-cookie').split(';')[0];
   if(path==='/auth/register'&&res.status===200){const verified=await mf.dispatchFetch('http://localhost/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:verificationMails.get(body.email.toLowerCase())})});assert.equal(verified.status,200);}
   return data;
  }
  const password='Test-only-password-2026!';
  const trainer=clients[0];
  await req(trainer,'/setup','POST',{setupToken:'test-only-setup-token-123456789',name:'Test Trainer',email:'trainer@example.invalid',password,groupName:'Testgruppe'});
  let me=await req(trainer,'/me');const gid=me.groups[0].id;
  const invite=await req(trainer,`/groups/${gid}/invites`,'POST',{},201);
  assert.match(invite.inviteUrl,/#invite=/);
  for(let i=1;i<=3;i++)await req(clients[i],'/auth/register','POST',{name:`Test Mitglied ${i}`,email:`member${i}@example.invalid`,password,inviteCode:invite.inviteCode,privacyAccepted:true});
  const singleUse=await req(trainer,`/groups/${gid}/invites`,'POST',{role:'trainer'},201);
  assert.equal(singleUse.maxUses,1);
  const concurrent=await Promise.all([1,2].map(i=>mf.dispatchFetch('http://localhost/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Concurrent ${i}`,email:`race${i}@example.invalid`,password,privacyAccepted:true,inviteCode:singleUse.inviteCode})})));
  const statuses=concurrent.map(r=>r.status).sort();assert.equal(statuses[0],200);assert.ok([400,409].includes(statuses[1]));
  const racers=await db.prepare("SELECT id FROM users WHERE email LIKE 'race%@example.invalid'").all();assert.equal(racers.results.length,1);
  await db.prepare('DELETE FROM users WHERE id=?').bind(racers.results[0].id).run();
  const event=await req(trainer,`/groups/${gid}/events`,'POST',{title:'Integrationstraining',startAt:'2026-12-18T17:30:00.000Z',location:'Testhalle',notes:'Nur Testdaten'},201);
  for(let i=1;i<=3;i++)await req(clients[i],`/events/${event.id}/rsvp`,'POST',{status:['yes','no','maybe'][i-1]});
  await req(clients[1],`/events/${event.id}/rsvp`,'POST',{status:'maybe'});
  const list=await req(trainer,`/events/${event.id}/participants`);
  assert.equal(list.participants.length,4);assert.equal(list.participants.find(x=>x.name==='Test Mitglied 1').status,'maybe');
  await req(clients[1],`/events/${event.id}/participants`,'GET',undefined,403);
  await req(clients[1],`/events/${event.id}`,'DELETE',{},403);
  await req(clients[4],`/groups/${gid}/events`,'GET',undefined,401);
  const secondDevice={cookie:''};await req(secondDevice,'/auth/login','POST',{email:'member1@example.invalid',password});
  assert.equal((await req(secondDevice,`/groups/${gid}/events`)).events[0].myResponse,'maybe');
  await req(trainer,`/events/${event.id}`,'PATCH',{title:'Geändert',startAt:'2026-12-19T17:30:00.000Z',location:'Andere Halle',notes:''});
  assert.equal((await req(secondDevice,`/groups/${gid}/events`)).events[0].title,'Geändert');
  await req(clients[3],'/groups','POST',{name:'Andere Gruppe'},403);
  const other={id:crypto.randomUUID()},otherOwner=(await req(clients[3],'/me')).user.id;
  await db.batch([db.prepare('INSERT INTO groups(id,name,created_by) VALUES(?,?,?)').bind(other.id,'Andere Gruppe',otherOwner),db.prepare("INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,'trainer')").bind(other.id,otherOwner)]);
  await req(clients[1],`/groups/${other.id}/events`,'GET',undefined,403);
  const members=(await req(trainer,`/groups/${gid}/members`)).members;
  const removed=members.find(x=>x.name==='Test Mitglied 2');
  await req(trainer,`/groups/${gid}/members/${removed.id}`,'DELETE',{});
  await req(clients[2],`/groups/${gid}/events`,'GET',undefined,403);
  assert.equal((await req(trainer,`/events/${event.id}/participants`)).participants.length,3);
  await req(trainer,'/auth/forgot-password','POST',{email:'trainer@example.invalid'},200);
  // Simulate a delivered token; exercise real hashing, expiration, replay and session invalidation.
  const token='a'.repeat(64),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  await db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(Buffer.from(hash).toString('hex'),me.user.id,new Date(Date.now()+60000).toISOString()).run();
  const newPassword='New-test-password-2026!';
  await req(trainer,'/auth/reset-password','POST',{token,password:newPassword});
  await req(trainer,'/me','GET',undefined,401);
  await req(trainer,'/auth/reset-password','POST',{token,password},400);
  await req(trainer,'/auth/login','POST',{email:'trainer@example.invalid',password},401);
  await req(trainer,'/auth/login','POST',{email:'trainer@example.invalid',password:newPassword});
  const promoted=members.find(x=>x.name==='Test Mitglied 1');
  await req(trainer,`/groups/${gid}/members/${promoted.id}`,'PATCH',{role:'trainer'});
  // Deleting an original creator must transfer references, not fail a foreign-key constraint.
  await req(trainer,'/scrum/projects/00000000-0000-4000-8000-000000000002/members','POST',{email:'member1@example.invalid',role:'project_admin'});
  await req(trainer,`/scrum/projects/00000000-0000-4000-8000-000000000002/members/${me.user.id}`,'DELETE',{});
  await req(trainer,'/me','DELETE',{});
  await req(secondDevice,'/auth/login','POST',{email:'member1@example.invalid',password});
  assert.equal((await req(secondDevice,'/me')).groups.find(x=>x.id===gid).role,'trainer');
  await assert.rejects(db.prepare("UPDATE memberships SET role='member' WHERE group_id=? AND user_id=?").bind(gid,promoted.id).run());
  await req(secondDevice,`/events/${event.id}`,'DELETE',{});
  assert.equal((await req(secondDevice,`/groups/${gid}/events`)).events.length,0);
  await req(secondDevice,`/groups/${gid}`,'DELETE',{});
  await req(secondDevice,'/auth/logout','POST',{});await req(secondDevice,'/me','GET',undefined,401);
 }finally{await mf.dispose();}
});
