import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('recovery email pipeline: generic reply, hashed expiring token, session revocation and replay protection',async()=>{
 const sent=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/core.js'},{type:'ESModule',path:'src/community.js'},{type:'ESModule',path:'src/email-invites.js'},{type:'ESModule',path:'src/platform.js'},{type:'ESModule',path:'src/project-page.js'},{type:'ESModule',path:'public/time.js'}],compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{SETUP_TOKEN:'test-only-setup-token-123456789',RESEND_API_KEY:'test-key-never-sent',MAIL_FROM:'TeamZeit <test@example.invalid>',APP_ORIGIN:'https://teamzeit.example.invalid'},outboundService:async request=>{
  assert.equal(request.url,'https://api.resend.com/emails');sent.push(await request.json());return Response.json({id:'mock-mail-id'});
 }}));
 try{
  const db=await mf.getD1Database('DB');
  for(const name of readdirSync('migrations').sort()){
   const sql=readFileSync(`migrations/${name}`,'utf8').replace(/--[^\n]*/g,'');
   const statements=sql.trim().match(/CREATE TRIGGER[\s\S]*?END;|[^;]+;/g)||[];
   for(let i=0;i<statements.length;i++){let s=statements[i];if(s.includes('CREATE TRIGGER')&&!s.includes('END;'))s+=statements[++i];await db.prepare(s).run();}
  }
  const post=(path,data,cookie)=>mf.dispatchFetch('http://localhost/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
  const setup=await post('/setup',{setupToken:'test-only-setup-token-123456789',name:'Test',email:'recovery@example.invalid',password:'TestPassword-Only!2026',groupName:'Test'});
  assert.equal(setup.status,200);const cookie=setup.headers.get('set-cookie').split(';')[0];
  const known=await post('/auth/forgot-password',{email:'recovery@example.invalid'});
  const unknown=await post('/auth/forgot-password',{email:'missing@example.invalid'});
  assert.equal(known.status,200);assert.deepEqual(await known.json(),await unknown.json());assert.equal(sent.length,1);
  assert.deepEqual(sent[0].to,['recovery@example.invalid']);
  const token=sent[0].text.match(/reset=([0-9a-f]{64})/)[1];
  const stored=await db.prepare('SELECT token_hash,expires_at FROM password_resets').first();assert.notEqual(stored.token_hash,token);assert.ok(Date.parse(stored.expires_at)-Date.now()<31*60000);
  assert.equal((await post('/auth/reset-password',{token,password:'UpdatedPassword-Only!2026'})).status,200);
  assert.equal((await mf.dispatchFetch('http://localhost/api/me',{headers:{cookie}})).status,401);
  assert.equal((await post('/auth/reset-password',{token,password:'AnotherPassword-Only!2026'})).status,400);
  assert.equal((await post('/auth/login',{email:'recovery@example.invalid',password:'UpdatedPassword-Only!2026'})).status,200);
 }finally{await mf.dispose();}
});
