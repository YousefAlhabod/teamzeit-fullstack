import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../src/worker.js';
import {invitationRecipients} from '../src/email-invites.js';

test('recipient parsing validates the entire batch and removes duplicates',()=>{
 assert.deepEqual(invitationRecipients(' A@example.invalid; b@example.invalid\na@example.invalid '),['a@example.invalid','b@example.invalid']);
 assert.throws(()=>invitationRecipients('good@example.invalid; invalid'));
 assert.throws(()=>invitationRecipients(Array.from({length:21},(_,i)=>`m${i}@example.invalid`)));
});

test('personal email invitations: real Worker/D1 and intercepted Resend batch',async t=>{
 const batches=[],verificationMails=new Map();let fail=false;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/core.js'},{type:'ESModule',path:'src/community.js'},{type:'ESModule',path:'src/email-invites.js'},{type:'ESModule',path:'src/platform.js'},{type:'ESModule',path:'src/project-page.js'},{type:'ESModule',path:'public/time.js'}],compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{SETUP_TOKEN:'test-only-setup-token-123456789',RESEND_API_KEY:'mock-only-no-real-mail',MAIL_FROM:'TeamZeit <mail@example.invalid>',APP_ORIGIN:'https://teamzeit.example.invalid'},outboundService:async request=>{
  if(request.url==='https://api.resend.com/emails'){const mail=await request.json();verificationMails.set(mail.to[0],mail.text.match(/#verify=([a-f0-9]{64})/)[1]);return Response.json({id:'mock-verification'});}
  assert.equal(request.url,'https://api.resend.com/emails/batch');
  const payload=await request.json();assert.match(request.headers.get('Idempotency-Key'),/^teamzeit-invites-/);batches.push(payload);
  return fail?Response.json({message:'Provider unavailable'},{status:429}):Response.json({data:payload.map(()=>({id:crypto.randomUUID()}))});
 }}));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of readdirSync('migrations').sort()){
   const sql=readFileSync(`migrations/${name}`,'utf8').replace(/--[^\n]*/g,'');
   const statements=sql.trim().match(/CREATE TRIGGER[\s\S]*?END;|[^;]+;/g)||[];
   for(let i=0;i<statements.length;i++){let s=statements[i];if(s.includes('CREATE TRIGGER')&&!s.includes('END;'))s+=statements[++i];await db.prepare(s).run();}
  }
  async function req(client,path,method='GET',body,status=200){
   const res=await mf.dispatchFetch('http://localhost/api'+path,{method,headers:{...(client.cookie?{cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const data=await res.json();assert.equal(res.status,status,`${path}: ${JSON.stringify(data)}`);
   if(res.headers.has('set-cookie'))client.cookie=res.headers.get('set-cookie').split(';')[0];if(path==='/auth/register'&&res.status===200){await req(client,'/auth/verify-email','POST',{token:verificationMails.get(body.email.toLowerCase())});}return data;
  }
  const trainer={},a={},b={},password='Only-Test-Password!2026';
  await req(trainer,'/setup','POST',{setupToken:'test-only-setup-token-123456789',name:'Trainer <Test>',email:'trainer@example.invalid',password,groupName:'Die wilden Waden'});
  const gid=(await req(trainer,'/me')).groups[0].id,path=`/groups/${gid}/email-invites`;
  const token=email=>batches.flat().filter(x=>x.to[0]===email).at(-1).text.match(/#invite=([a-f0-9]{32})/)[1];
  const register=(client,email,code,status=200)=>req(client,'/auth/register','POST',{name:email.split('@')[0],email,password,inviteCode:code,privacyAccepted:true,role:'trainer'},status);
  let codeA,codeB;
  await t.test('batch sends private, distinct, hashed and address-bound single-use links',async()=>{
   const result=await req(trainer,path,'POST',{emails:'A@example.invalid; b@example.invalid\na@example.invalid',expiresInDays:3});
   assert.equal(batches.length,1);assert.equal(batches[0].length,2);assert.equal(result.invitations.length,2);
   codeA=token('a@example.invalid');codeB=token('b@example.invalid');assert.notEqual(codeA,codeB);
   assert.ok(batches[0][0].html.includes('Trainer &lt;Test&gt;'));assert.equal(batches[0][0].to.length,1);assert.equal(batches[0][0].cc,undefined);
   const stored=await db.prepare("SELECT token_hash,max_uses,role FROM invitations WHERE recipient_email='a@example.invalid'").first();
   assert.notEqual(stored.token_hash,codeA);assert.equal(stored.max_uses,1);assert.equal(stored.role,'member');
   assert.ok(!JSON.stringify(result).includes(codeA));assert.equal(result.invitations[0].status,'pending');
   assert.equal((await req({},'/invites/preview','POST',{inviteCode:codeA})).email,'a@example.invalid');
   await register({},'attacker@example.invalid',codeA,403);
  });
  await t.test('registration joins the correct group and reports accepted; members cannot administer invites',async()=>{
   await register(a,'a@example.invalid',codeA);
   assert.equal((await req(a,'/me')).groups.find(x=>x.id===gid).role,'member');
   const row=(await req(trainer,path)).invitations.find(x=>x.email==='a@example.invalid');assert.equal(row.status,'accepted');assert.ok(row.acceptedAt);assert.equal(row.canResend,false);
   await req(trainer,`${path}/${row.id}/resend`,'POST',{},409);
   await req(a,path,'GET',undefined,403);await req(a,path,'POST',{emails:'other@example.invalid'},403);
   await req({},path,'GET',undefined,401);await req({},'/invites/preview','POST',{inviteCode:codeA},400);
   await register({},'a@example.invalid',codeA,400);
  });
  await t.test('existing accounts accept only their own invitation, without creating a second account',async()=>{
   const other=await req(trainer,'/groups','POST',{name:'Other group'},201);
   const legacy=await req(trainer,`/groups/${other.id}/invites`,'POST',{},201);
   await register(b,'b@example.invalid',legacy.inviteCode);
   await req(a,'/groups/join','POST',{inviteCode:codeB},403);
   await req(b,'/groups/join','POST',{inviteCode:codeB});
   assert.equal((await req(b,'/me')).groups.find(x=>x.id===gid).role,'member');
   assert.equal((await req(trainer,path)).invitations.find(x=>x.email==='b@example.invalid').status,'accepted');
   assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email='b@example.invalid'").first()).n,1);
   await req(a,`/groups/${other.id}/email-invites`,'GET',undefined,403);
  });
  await t.test('failure, cooldown, resend rotation and expiry have truthful statuses',async()=>{
   fail=true;let result=await req(trainer,path,'POST',{emails:['c@example.invalid']});let row=result.invitations.find(x=>x.email==='c@example.invalid');
   assert.equal(result.results[0].status,'failed');assert.equal(row.deliveryStatus,'failed');const old=token('c@example.invalid');
   const before=batches.length;result=await req(trainer,`${path}/${row.id}/resend`,'POST',{});assert.equal(result.results[0].status,'cooldown');assert.equal(batches.length,before);
   await db.prepare('UPDATE invitations SET send_attempted_at=? WHERE id=?').bind(new Date(Date.now()-61000).toISOString(),row.id).run();
   fail=false;result=await req(trainer,`${path}/${row.id}/resend`,'POST',{expiresInDays:1});assert.equal(result.results[0].status,'sent');assert.notEqual(token('c@example.invalid'),old);
   await req({},'/invites/preview','POST',{inviteCode:old},400);
   await db.prepare('UPDATE invitations SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),row.id).run();
   assert.equal((await req(trainer,path)).invitations.find(x=>x.id===row.id).status,'expired');
   await register({},'c@example.invalid',token('c@example.invalid'),400);
   await db.prepare('UPDATE invitations SET send_attempted_at=? WHERE id=?').bind(new Date(Date.now()-61000).toISOString(),row.id).run();
   result=await req(trainer,`${path}/${row.id}/resend`,'POST',{expiresInDays:1});row=result.invitations.find(x=>x.id===row.id);assert.equal(row.status,'pending');assert.ok(Date.parse(row.expiresAt)>Date.now());
   await req(trainer,path,'POST',{emails:['x@example.invalid'],expiresInDays:365},400);
  });
  await t.test('concurrent sends create only one message and bulk remains bounded',async()=>{
   await Promise.all([req(trainer,path,'POST',{emails:['race@example.invalid']}),req(trainer,path,'POST',{emails:['race@example.invalid']})]);
   assert.equal(batches.flat().filter(x=>x.to[0]==='race@example.invalid').length,1);
   const emails=Array.from({length:20},(_,i)=>`bulk${i}@example.invalid`);const result=await req(trainer,path,'POST',{emails});assert.equal(result.results.filter(x=>x.status==='sent').length,20);assert.equal(batches.at(-1).length,20);
   const before=batches.length;await req(trainer,path,'POST',{emails:[...emails,'extra@example.invalid']},400);await req(trainer,path,'POST',{emails:'valid@example.invalid; invalid'},400);assert.equal(batches.length,before);
   const spoofed=await mf.dispatchFetch('http://localhost/api'+path,{method:'POST',headers:{cookie:trainer.cookie,'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({emails:['x@example.invalid']})});assert.equal(spoofed.status,403);
  });
  await t.test('account deletion removes addressed invites; daily cleanup retains recent history',async()=>{
   await req(a,'/me','DELETE',{});assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE recipient_email='a@example.invalid'").first()).n,0);
   await db.prepare("UPDATE invitations SET expires_at=? WHERE recipient_email='c@example.invalid'").bind(new Date(Date.now()-86400000).toISOString()).run();
   await db.prepare("UPDATE invitations SET expires_at=? WHERE recipient_email='race@example.invalid'").bind(new Date(Date.now()-31*86400000).toISOString()).run();
   await worker.scheduled({}, {DB:db});
   assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE recipient_email='c@example.invalid'").first()).n,1);
   assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM invitations WHERE recipient_email='race@example.invalid'").first()).n,0);
  });
 }finally{await mf.dispose();}
});
