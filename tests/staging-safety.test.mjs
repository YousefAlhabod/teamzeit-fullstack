import {test} from 'node:test';import assert from 'node:assert/strict';import staging from '../scripts/staging-worker.js';
test('performance staging is private and suppresses email configuration',async t=>{
 const key='synthetic-staging-access-key';let databaseCalls=0;
 const env={STAGING_ACCESS_KEY:key,RESEND_API_KEY:'must-never-be-used',MAIL_FROM:'test@example.invalid',APP_ORIGIN:'https://staging.example.invalid',DB:{prepare(){databaseCalls++;return {bind(){return this;},all:async()=>({results:[{count:1}],meta:{rows_written:1}})};}}};
 assert.equal((await staging.fetch(new Request('https://staging.example.invalid/api/health'),env)).status,403);assert.equal(databaseCalls,0);
 t.mock.method(globalThis,'fetch',()=>{throw Error('Staging must not send mail');});
 const r=await staging.fetch(new Request('https://staging.example.invalid/api/auth/forgot-password',{method:'POST',headers:{'X-Teamzeit-Staging-Key':key,'Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.invalid'})}),env);
 assert.equal(r.status,503);assert.match((await r.json()).error,/Wiederherstellung/);assert.equal(databaseCalls,1);
});
