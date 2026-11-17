import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './platform-fixture.mjs';
test('personal administrator directory: access, statuses, pagination and immediate revocation',async()=>{
 const f=await fixture({bindings:{USER_DIRECTORY_ADMIN_EMAIL:'owner-0@example.invalid'}});
 const {db,user,request,mf}=f;
 try{
  const owner=await user('owner'),otherAdmin=await user('other-admin'),member=await user('member'),pending=await user('pending'),verified=await user('verified');
  for(const u of [owner,otherAdmin])await db.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').bind(u.id).run();
  await db.prepare('UPDATE users SET verification_required=1 WHERE id=?').bind(pending.id).run();
  await db.prepare('UPDATE users SET verification_required=1,email_verified_at=? WHERE id=?').bind(new Date().toISOString(),verified.id).run();
  assert.equal((await request({},'/api/admin/users')).status,401);
  for(const u of [otherAdmin,member,pending])assert.equal((await request(u,'/api/admin/users')).status,403);
  assert.equal((await (await request(owner,'/api/me')).json()).userDirectory,true);
  assert.equal((await (await request(otherAdmin,'/api/me')).json()).userDirectory,false);
  let d=await (await request(owner,'/api/admin/users')).json();
  assert.equal(d.users.length,5);assert.equal(d.next,null);
  assert.equal(d.users.find(u=>u.email===pending.email).status,'E-Mail-Bestätigung ausstehend');
  assert.equal(d.users.find(u=>u.email===verified.email).status,'E-Mail bestätigt');
  assert.equal(d.users.find(u=>u.email===owner.email).status,'Registriert (Bestandskonto)');
  assert.deepEqual(Object.keys(d.users[0]).sort(),['email','name','status']);
  const base=await db.prepare('SELECT password_hash,password_salt FROM users LIMIT 1').first();
  await db.batch(Array.from({length:100},(_,i)=>db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'Page '+i,`page${i}@example.invalid`,base.password_hash,base.password_salt)));
  d=await (await request(owner,'/api/admin/users')).json();assert.equal(d.users.length,100);assert.ok(d.next);
  const next=await (await request(owner,'/api/admin/users?after='+d.next)).json();assert.equal(next.users.length,5);assert.equal(next.next,null);assert.equal(new Set([...d.users,...next.users].map(u=>u.email)).size,105);
  assert.equal((await request(owner,'/api/admin/users?after=invalid')).status,400);
  await db.prepare('DELETE FROM platform_admins WHERE user_id=?').bind(owner.id).run();
  assert.equal((await request(owner,'/api/admin/users')).status,403);
 }finally{await mf.dispose();}
});
