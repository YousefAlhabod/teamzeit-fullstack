import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const base='https://teamzeit.yousef-alhabod.de',seed=JSON.parse(readFileSync('.private/test-access.json'));
const report={at:new Date().toISOString(),origin:base,checks:[]};
const trainer={email:seed.email,password:seed.password,cookie:''},members=[];
async function req(client,path,method='GET',body,status=200,extraHeaders={}){
 const headers={...extraHeaders};if(client.cookie)headers.cookie=client.cookie;
 if(body!==undefined)headers['Content-Type']='application/json';
 const res=await fetch(base+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await res.json()}catch{data={error:'Non-JSON response'}};
 assert.equal(res.status,status,`${method} ${path}: ${JSON.stringify(data)}`);
 if(res.headers.has('set-cookie')){assert.match(res.headers.get('set-cookie'),/HttpOnly/);assert.match(res.headers.get('set-cookie'),/Secure/);client.cookie=res.headers.get('set-cookie').split(';')[0];}
 return data;
}
try{
 await req(trainer,'/auth/login','POST',{email:trainer.email,password:trainer.password});report.checks.push('Trainer login + Secure HttpOnly cookie');
 const me=await req(trainer,'/me');
 const group=await req(trainer,'/groups','POST',{name:'E2E '+Date.now()},201);const gid=group.id;
 const invite=await req(trainer,`/groups/${gid}/invites`,'POST',{},201);
 const password=randomBytes(20).toString('base64url')+'!Test9';
 for(let i=1;i<=3;i++){
  const member={name:`Test Mitglied ${i}`,email:`e2e-${Date.now()}-${i}@example.invalid`,password,cookie:''};
  await req(member,'/auth/register','POST',{...member,inviteCode:invite.inviteCode,privacyAccepted:true});members.push(member);
 }
 report.checks.push('Three independent member registrations through invitation');
 const event=await req(trainer,`/groups/${gid}/events`,'POST',{title:'Produktionstest Training',startAt:'2026-12-20T17:30:00.000Z',location:'Testhalle',notes:'Fiktive Testdaten'},201);
 for(let i=0;i<3;i++)await req(members[i],`/events/${event.id}/rsvp`,'POST',{status:['yes','no','maybe'][i]});
 let list=await req(trainer,`/events/${event.id}/participants`);
 assert.deepEqual(list.participants.filter(p=>p.name.startsWith('Test Mitglied')).map(p=>p.status).sort(),['maybe','no','yes']);
 await req(members[0],`/events/${event.id}/rsvp`,'POST',{status:'maybe'});
 list=await req(trainer,`/events/${event.id}/participants`);assert.equal(list.participants.find(p=>p.name==='Test Mitglied 1').status,'maybe');
 report.checks.push('Zusage, Absage, Vielleicht and changed answer reflected in participant list');
 const second={cookie:''};await req(second,'/auth/login','POST',{email:members[0].email,password});
 assert.equal((await req(second,`/groups/${gid}/events`)).events[0].myResponse,'maybe');
 report.checks.push('Saved reply retrieved through a new independent login session');
 await req(members[0],`/events/${event.id}/participants`,'GET',undefined,403);
 await req(members[0],`/events/${event.id}`,'DELETE',{},403);
 await req(members[0],`/groups/${gid}/invites`,'POST',{},403);
 await req({cookie:''},`/groups/${gid}/events`,'GET',undefined,401);
 await req(trainer,'/auth/logout','POST',{},403,{Origin:'https://evil.example'});
 const other=await req(members[2],'/groups','POST',{name:'Isolierte E2E Gruppe'},201);
 await req(members[0],`/groups/${other.id}/events`,'GET',undefined,403);
 await req(members[2],`/groups/${other.id}`,'DELETE',{});
 report.checks.push('Member/admin separation, cross-group access, unauthenticated access and cross-origin rejection');
 await req(trainer,`/events/${event.id}`,'PATCH',{title:'Geänderter Produktionstest',startAt:'2026-12-21T17:30:00.000Z',location:'Testplatz',notes:''});
 assert.equal((await req(second,`/groups/${gid}/events`)).events[0].title,'Geänderter Produktionstest');
 report.checks.push('Event edits visible from another session');
 const deletion=await req(trainer,`/groups/${gid}/events`,'POST',{title:'Löschtest',startAt:'2026-12-21T18:30:00.000Z',location:'Test',notes:''},201);
 await req(trainer,`/events/${deletion.id}`,'DELETE',{});
 assert.equal((await req(trainer,`/groups/${gid}/events`)).events.length,1);report.checks.push('Event deletion persisted');
 const exported=await req(members[0],'/me/export');assert.equal(exported.responses.length,1);report.checks.push('Private data export');
 await req(second,'/auth/logout','POST',{});await req(second,'/me','GET',undefined,401);report.checks.push('Logout invalidates session');
 const publicPage=await fetch(base);assert.equal(publicPage.status,200);assert.match(publicPage.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const http=await fetch(base.replace('https:','http:'),{redirect:'manual'});assert.equal(http.status,308);
 report.checks.push('HTTPS, HTTP redirect and static page security headers');
 writeFileSync('.private/production-fixture.json',JSON.stringify({trainer,members,gid,eventId:event.id,inviteUrl:invite.inviteUrl}),{mode:0o600});
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
writeFileSync('test-results/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
