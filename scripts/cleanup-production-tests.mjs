import {readFileSync,writeFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('.private/production-fixture.json'));
const base='https://teamzeit.yousef-alhabod.de';
async function request(client,path,method='GET',body){
 const res=await fetch(base+'/api'+path,{method,headers:{...(client.cookie?{cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await res.json();if(!res.ok)throw Error(`${path}: ${data.error}`);if(res.headers.has('set-cookie'))client.cookie=res.headers.get('set-cookie').split(';')[0];return data;
}
await request(fixture.trainer,'/auth/login','POST',{email:fixture.trainer.email,password:fixture.trainer.password});
// Only the exact fixture group and known synthetic accounts created by this task.
await request(fixture.trainer,`/groups/${fixture.gid}`,'DELETE',{});
for(const client of [...fixture.members,{email:'browser-e2e-20261116@example.invalid',password:'Browser-Test-Only!2026'}]){
 if(!client.email.endsWith('@example.invalid'))throw Error('Refusing to delete non-test account');
 await request(client,'/auth/login','POST',{email:client.email,password:client.password});
 await request(client,'/me','DELETE',{});
}
await request(fixture.trainer,'/auth/logout','POST',{});
writeFileSync('test-results/cleanup.json',JSON.stringify({at:new Date().toISOString(),removedTestGroup:fixture.gid,removedSyntheticMembers:4,initialTrainerRetainedForOwnerHandoff:true},null,2));
console.log('Removed exact test group and four synthetic member accounts. Initial trainer retained for secure owner handoff.');
