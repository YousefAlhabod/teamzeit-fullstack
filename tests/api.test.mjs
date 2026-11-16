import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

test('health endpoint funktioniert ohne Login',async()=>{
 const res=await worker.fetch(new Request('http://localhost/api/health'),{},{});
 assert.equal(res.status,200);assert.equal((await res.json()).status,'ok');
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('CORS/Origin Schutz für mutierende Endpunkte',async()=>{
 const req=new Request('https://teamzeit.example/api/auth/logout',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});
 const res=await worker.fetch(req,{},{});
 assert.equal(res.status,403);
});
test('Setup-Status liest aus D1',async()=>{
 const env={DB:{prepare:()=>({first:async()=>({n:0})})}};
 const res=await worker.fetch(new Request('http://localhost/api/setup/status'),env,{});
 assert.deepEqual(await res.json(),{initialized:false,registrationEnabled:true,recoveryEnabled:false});
});
test('Login-geschützte API liefert 401 ohne Session',async()=>{
 const res=await worker.fetch(new Request('http://localhost/api/me'),{},{});
 assert.equal(res.status,401);
});
