import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './platform-fixture.mjs';
import {recurringDates,flushNotifications} from '../src/platform.js';
test('weekly series preserves Berlin wall time across daylight saving',()=>{
 assert.deepEqual(recurringDates('2027-03-21T17:30:00.000Z',3),['2027-03-21T17:30:00.000Z','2027-03-28T16:30:00.000Z','2027-04-04T16:30:00.000Z']);
 assert.throws(()=>recurringDates('2027-03-21T17:30:00.000Z',100));
});
test('regional roles, capacity, FIFO waitlist and notification outbox',async t=>{
 const mails=[];
 const f=await fixture({outboundService:async request=>{mails.push(await request.json());return Response.json({id:crypto.randomUUID()});}});
 const {db,request,user,mf}=f;
 async function req(c,p,m='GET',b,status=200){const r=await request(c,p,m,b),d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
 try{
  const admin=await user('admin'),manager=await user('manager'),trainer=await user('trainer'),member=await user('member'),other=await user('other'),reviewer=await user('reviewer');
  await db.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').bind(admin.id).run();
  const h=(await req(admin,'/api/locations','POST',{name:'Hannover',city:'Hannover'},201)).id,b=(await req(admin,'/api/locations','POST',{name:'Berlin',city:'Berlin'},201)).id;
  await req(admin,'/api/admin/access','POST',{email:manager.email,role:'location_manager',locationId:h,enabled:true});
  const g=(await req(manager,'/api/groups','POST',{name:'Hannover Gruppe',locationId:h},201)).id,foreign=(await req(admin,'/api/groups','POST',{name:'Berlin Gruppe',locationId:b},201)).id;
  for(const [u,role] of [[trainer,'trainer'],[member,'member'],[other,'member']])await db.prepare('INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,?)').bind(g,u.id,role).run();
  let event;
  await t.test('scoped roles and protected project information',async()=>{
   await req(member,'/api/locations','POST',{name:'Forged'},403);
   await req(member,'/api/groups','POST',{name:'Forged'},403);
   await req(manager,'/api/locations/'+b,'PATCH',{name:'Forged',city:'Berlin'},403);
   await req(manager,`/api/groups/${foreign}/events`,'GET',undefined,403);
   await req(trainer,`/api/groups/${foreign}/events`,'GET',undefined,403);
   await req(member,'/api/admin/access','POST',{email:member.email,role:'platform_admin',enabled:true},403);
   await req(admin,'/api/admin/access','POST',{email:admin.email,role:'platform_admin',enabled:false},409);
   assert.equal((await request({},'/projekt')).status,401);assert.equal((await request(member,'/projekt')).status,403);assert.equal((await request(trainer,'/projekt')).status,200);
   await req(admin,'/api/admin/access','POST',{email:reviewer.email,role:'project_reviewer',enabled:true});
   assert.equal((await request(reviewer,'/projekt')).status,200);await req(reviewer,`/api/groups/${g}/events`,'GET',undefined,403);
   assert.ok((await req(manager,'/api/me')).groups.some(x=>x.id===g));assert.ok(!(await req(manager,'/api/me')).groups.some(x=>x.id===foreign));
  });
  const input={title:'Limittraining',startAt:'2027-03-21T17:30:00.000Z',location:'Testhalle',capacity:1,repeatWeeks:3};
  await t.test('weekly creation and date pagination validation',async()=>{
   await req(member,`/api/groups/${g}/events`,'POST',input,403);
   const created=await req(trainer,`/api/groups/${g}/events`,'POST',input,201);event=created.id;assert.equal(created.ids.length,3);
   await req(admin,`/api/events/${event}/rsvp`,'POST',{status:'yes'},403);
   assert.equal((await req(member,`/api/groups/${g}/events?from=2027-03-27T00:00:00.000Z&to=2027-03-29T00:00:00.000Z`)).events.length,1);
   await req(member,`/api/groups/${g}/events?offset=-1`,'GET',undefined,400);
  });
  await t.test('concurrent bookings never overbook; cancellation promotes oldest waiter once',async()=>{
   await req(member,'/api/me/notifications','PATCH',{enabled:true});await req(other,'/api/me/notifications','PATCH',{enabled:true});
   await Promise.all([member,other].map(c=>req(c,`/api/events/${event}/rsvp`,'POST',{status:'yes'})));
   const rows=(await db.prepare('SELECT user_id,booking_state FROM responses WHERE event_id=?').bind(event).all()).results;
   assert.equal(rows.filter(r=>r.booking_state==='confirmed').length,1);assert.equal(rows.filter(r=>r.booking_state==='waitlisted').length,1);
   const confirmed=[member,other].find(c=>c.id===rows.find(r=>r.booking_state==='confirmed').user_id),waiting=confirmed===member?other:member;
   await req(confirmed,`/api/events/${event}/rsvp`,'POST',{status:'no'});
   const list=(await req(waiting,`/api/groups/${g}/events`)).events;assert.equal(list.find(e=>e.id===event).myBookingState,'confirmed');
   await req(confirmed,`/api/events/${event}/rsvp`,'POST',{status:'yes'});
   assert.equal((await db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE kind='promoted'").first()).n,1);
   await req(member,`/api/events/${event}/participants`,'GET',undefined,403);
   await req(trainer,`/api/events/${event}`,'PATCH',{...input,capacity:2});
   assert.equal((await db.prepare("SELECT COUNT(*) n FROM responses WHERE event_id=? AND booking_state='confirmed'").bind(event).first()).n,2);
   await req(trainer,`/api/events/${event}`,'PATCH',input,409);
  });
  await t.test('notification delivery is opt-in and suppresses opted-out recipients',async()=>{
   await req(member,'/api/me/notifications','PATCH',{enabled:false});
   t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.match(options.headers['Idempotency-Key'],/^training-/);mails.push(JSON.parse(options.body));return Response.json({id:crypto.randomUUID()});});
   await flushNotifications({DB:db,RESEND_API_KEY:'mock-no-real-mails',MAIL_FROM:'TeamZeit <test@example.invalid>',APP_ORIGIN:'https://example.invalid'});
   assert.ok(mails.length>0);assert.ok(mails.every(m=>m.to.length===1&&m.to[0]===other.email));
   const count=mails.length;await flushNotifications({DB:db,RESEND_API_KEY:'mock-no-real-mails',MAIL_FROM:'TeamZeit <test@example.invalid>'});assert.equal(mails.length,count);
   await req(trainer,`/api/events/${event}`,'DELETE',{});
   assert.equal((await db.prepare("SELECT COUNT(*) n FROM notification_outbox WHERE kind='cancelled' AND user_id=?").bind(other.id).first()).n,1);
  });
 }finally{await mf.dispose();}
});
