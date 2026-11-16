import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './platform-fixture.mjs';
test('optimized authorization always rechecks revocation; login failures count atomically',async()=>{
 const f=await fixture(),{db,user,request,mf}=f;try{
  const trainer=await user('perf-trainer'),member=await user('perf-member');const gid=crypto.randomUUID();
  await db.batch([db.prepare('INSERT INTO groups(id,name,created_by) VALUES(?,?,?)').bind(gid,'Performance regression',trainer.id),db.prepare("INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,'trainer')").bind(gid,trainer.id),db.prepare("INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,'member')").bind(gid,member.id)]);
  assert.equal((await request({},'/api/groups/invalid/events')).status,401);
  assert.equal((await request(member,'/api/groups/invalid/events')).status,400);
  assert.equal((await request(member,`/api/groups/${gid}/events`)).status,200);
  await db.prepare('DELETE FROM memberships WHERE group_id=? AND user_id=?').bind(gid,member.id).run();assert.equal((await request(member,`/api/groups/${gid}/events`)).status,403);
  await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(trainer.id).run();assert.equal((await request(trainer,`/api/groups/${gid}/events`)).status,401);
  const failures=await Promise.all(Array.from({length:8},()=>request({},'/api/auth/login','POST',{email:member.email,password:'intentionally-wrong-password'})));
  assert.ok(failures.every(r=>[401,429].includes(r.status)));
  const row=await db.prepare('SELECT count,blocked_until FROM login_attempts WHERE email=?').bind(member.email).first();assert.equal(row.count,8);assert.ok(row.blocked_until>new Date().toISOString());
  assert.equal((await request({},'/api/auth/login','POST',{email:member.email,password:member.password})).status,429);
  await db.prepare('UPDATE login_attempts SET first_at=?,blocked_until=? WHERE email=?').bind(new Date(Date.now()-1800000).toISOString(),new Date(Date.now()-1000).toISOString(),member.email).run();
  assert.equal((await request({},'/api/auth/login','POST',{email:member.email,password:member.password})).status,200);assert.equal(await db.prepare('SELECT count FROM login_attempts WHERE email=?').bind(member.email).first(),null);
  assert.equal((await request({},'/api/auth/login','POST',{email:'missing@example.invalid',password:member.password})).status,401);
 }finally{await mf.dispose();}
});
