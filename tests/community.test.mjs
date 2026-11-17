import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './platform-fixture.mjs';
const pid='00000000-0000-4000-8000-000000000002';
test('open registration, verified email, independent Scrum roles and real task workflow',async t=>{
 const mails=[];let mailFails=false;
 const f=await fixture({bindings:{RESEND_API_KEY:'mock-only',MAIL_FROM:'TeamZeit <test@example.invalid>',APP_ORIGIN:'https://example.invalid',REGISTRATION_ENABLED:'true'},outboundService:async request=>{assert.equal(request.url,'https://api.resend.com/emails');mails.push(await request.json());return Response.json({id:'mock'},{status:mailFails?503:200});}});
 const {db,user,request,mf}=f;async function req(c,p,m='GET',b,status=200){const r=await request(c,'/api'+p,m,b),d=await r.json();assert.equal(r.status,status,`${p}: ${JSON.stringify(d)}`);if(r.headers.has('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];return d;}
 const token=email=>mails.filter(x=>x.to[0]===email).at(-1).text.match(/#verify=([a-f0-9]{64})/)[1];
 try{
  const admin=await user('project-admin'),guest={},stakeholder=await user('stakeholder'),po=await user('owner'),sm=await user('scrum-master'),sportAdmin=await user('sport-admin');
  await db.batch([db.prepare('INSERT INTO scrum_members(project_id,user_id,role) VALUES(?,?,?)').bind(pid,admin.id,'project_admin'),db.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').bind(admin.id)]);
  const group=(await req(admin,'/groups','POST',{name:'Sport only'},201)).id;
  const invite=await req(admin,`/groups/${group}/invites`,'POST',{},201);let guestId;
  await t.test('any new person registers without invitation and receives no privileged role',async()=>{
   const r=await req(guest,'/auth/register','POST',{name:'Beliebige neue Person',email:'new-person@example.invalid',password:f.password,privacyAccepted:true,role:'project_admin',projectRole:'product_owner'});
   assert.equal(r.user.accountRole,'member');assert.equal(r.user.verificationRequired,true);guestId=r.user.id;assert.equal(r.verificationSent,true);
   assert.deepEqual((await req(guest,'/me')).groups,[]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM scrum_members WHERE user_id=?').bind(guestId).first()).n,0);
   await req(guest,'/scrum/projects','GET',undefined,403);await req(guest,'/groups/join','POST',{inviteCode:invite.inviteCode},403);
   await req(guest,'/auth/register','POST',{name:'Overwrite attempt',email:'new-person@example.invalid',password:'Changed-malicious-password!',privacyAccepted:true},409);
  });
  await t.test('verification tokens are hashed, expiring, rotated and single-use',async()=>{
   const old=token('new-person@example.invalid'),stored=await db.prepare('SELECT token_hash,expires_at FROM email_verifications WHERE user_id=?').bind(guestId).first();assert.notEqual(stored.token_hash,old);assert.ok(Date.parse(stored.expires_at)>Date.now());
   await req(guest,'/auth/resend-verification','POST',{});const latest=token('new-person@example.invalid');assert.notEqual(latest,old);
   await req({},'/auth/verify-email','POST',{token:old},400);await req({},'/auth/verify-email','POST',{token:latest});await req({},'/auth/verify-email','POST',{token:latest},400);
   const me=await req(guest,'/me');assert.equal(me.user.emailVerified,true);assert.equal(me.user.verificationRequired,false);assert.deepEqual((await req(guest,'/scrum/projects')).projects,[]);
  });
  await t.test('verified people join and leave sports groups without acquiring Scrum roles',async()=>{
   await req(guest,'/groups/join','POST',{inviteCode:invite.inviteCode});
   const ev=await req(admin,`/groups/${group}/events`,'POST',{title:'Test',startAt:'2027-12-01T17:30:00.000Z',location:'Synthetic'},201);
   await req(guest,`/events/${ev.id}/rsvp`,'POST',{status:'yes'});await req(guest,`/groups/${group}/leave`,'POST',{});
   await req(guest,`/groups/${group}/events`,'GET',undefined,403);assert.equal((await db.prepare('SELECT COUNT(*) n FROM responses WHERE user_id=?').bind(guestId).first()).n,0);
   await req(admin,`/groups/${group}/leave`,'POST',{},409);assert.equal((await db.prepare('SELECT COUNT(*) n FROM training_events WHERE group_id=?').bind(group).first()).n,1);
   assert.deepEqual((await req(guest,'/scrum/projects')).projects,[]);
  });
  let task;
  await t.test('project admin assigns all Scrum roles to registered users; sport rights do not grant project access',async()=>{
   for(const [person,role]of [[{email:'new-person@example.invalid'},'developer'],[stakeholder,'stakeholder'],[po,'product_owner'],[sm,'scrum_master']])await req(admin,`/scrum/projects/${pid}/members`,'POST',{email:person.email,role});
   assert.equal((await req(guest,'/scrum/projects')).projects[0].role,'developer');assert.deepEqual((await req(guest,'/me')).groups,[]);
   await db.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').bind(sportAdmin.id).run();await req(sportAdmin,`/scrum/projects/${pid}/tasks`,'GET',undefined,403);
   await req(sm,`/scrum/projects/${pid}/members`,'POST',{email:sm.email,role:'project_admin'},403);
   await req(admin,`/scrum/projects/${pid}/members`,'POST',{email:'unregistered@example.invalid',role:'developer'},404);
   await req(admin,`/scrum/projects/${pid}/members`,'POST',{email:admin.email,role:'product_owner'},409);await req(admin,`/scrum/projects/${pid}/members/${admin.id}`,'DELETE',{},409);
  });
  await t.test('tasks are assigned, progressed and protected against stale edits and unauthorized changes',async()=>{
   await req(admin,`/scrum/projects/${pid}/tasks`,'POST',{title:'Keine Person',description:'Beschreibung'},400);
   await req(admin,`/scrum/projects/${pid}/tasks`,'POST',{title:'Keine Beschreibung',assigneeId:guestId},400);
   task=await req(admin,`/scrum/projects/${pid}/tasks`,'POST',{title:'Echte Aufgabe',description:'Test <script>literal</script>',assigneeId:guestId},201);
   await req(guest,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{status:'in_progress',version:1});
   await req(admin,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{title:'Stale overwrite',version:1},409);
   await req(guest,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{title:'Unauthorized title',version:2},403);
   await req(stakeholder,`/scrum/projects/${pid}/tasks`,'POST',{title:'Forbidden'},403);await req(stakeholder,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{status:'done',version:2},403);
   for(const person of [po,sm])await req(person,`/scrum/projects/${pid}/tasks`,'POST',{title:'Planbare Aufgabe',description:'Projektplanung',assigneeId:person.id},201);
   await req(admin,`/scrum/projects/${pid}/tasks`,'POST',{title:'Foreign assignee',assigneeId:sportAdmin.id},400);
   await req(guest,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{status:'review',version:2});
   await req(admin,`/scrum/projects/${pid}/tasks/${task.id}`,'PATCH',{status:'done',version:3});
   assert.equal((await req(stakeholder,`/scrum/projects/${pid}/tasks`)).tasks.find(t=>t.id===task.id).status,'done');
   await req(admin,`/scrum/projects/${pid}/members/${guestId}`,'DELETE',{});await req(guest,`/scrum/projects/${pid}/tasks`,'GET',undefined,403);
   assert.equal((await db.prepare('SELECT assignee_id FROM scrum_tasks WHERE id=?').bind(task.id).first()).assignee_id,null);
  });
  await t.test('failed email delivery leaves a recoverable pending account without access',async()=>{
   const pending={};mailFails=true;const r=await req(pending,'/auth/register','POST',{name:'Pending',email:'pending@example.invalid',password:f.password,privacyAccepted:true});assert.equal(r.verificationSent,false);
   await req(pending,'/scrum/projects','GET',undefined,403);mailFails=false;await req(pending,'/auth/resend-verification','POST',{});
   await db.prepare('UPDATE email_verifications SET expires_at=? WHERE user_id=?').bind(new Date(Date.now()-1000).toISOString(),r.user.id).run();await req({},'/auth/verify-email','POST',{token:token('pending@example.invalid')},400);
   await req(pending,'/me','DELETE',{});assert.equal((await db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').bind(r.user.id).first()).n,0);
  });
 }finally{await mf.dispose();}
});
