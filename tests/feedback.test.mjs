import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './platform-fixture.mjs';
test('feedback: registered access, categories, pagination, owner moderation, limits and deletion',async()=>{
 const f=await fixture({bindings:{USER_DIRECTORY_ADMIN_EMAIL:'owner-0@example.invalid'}}),{db,user,request,mf}=f;
 async function req(c,p,m='GET',b,status=200){const r=await request(c,'/api'+p,m,b);assert.equal(r.status,status);return r.json();}
 try{
  const owner=await user('owner'),member=await user('member'),other=await user('other'),pending=await user('pending');
  for(const u of [owner,other])await db.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').bind(u.id).run();
  await db.prepare('UPDATE users SET verification_required=1 WHERE id=?').bind(pending.id).run();
  await req({},'/feedback','GET',undefined,401);await req({},'/feedback','POST',{kind:'comment',content:'No'},401);await req(pending,'/feedback','GET',undefined,403);
  for(const kind of ['comment','improvement','feature'])await req(member,'/feedback','POST',{kind,content:`  <script>${kind}</script>  `},201);
  let list=await req(member,'/feedback');assert.equal(list.posts.length,3);assert.equal(list.canDelete,false);assert.equal(list.posts[0].author,'member');assert.equal(list.posts[0].content,'<script>feature</script>');assert.equal('email' in list.posts[0],false);assert.equal('user_id' in list.posts[0],false);
  assert.equal((await req(owner,'/feedback')).canDelete,true);assert.equal((await req(other,'/feedback')).canDelete,false);
  const id=list.posts[0].id;
  await req(member,`/feedback/${id}`,'DELETE',{},403);await req(other,`/feedback/${id}`,'DELETE',{},403);
  for(const data of [{kind:'invalid',content:'x'},{kind:'comment',content:' '},{kind:'feature',content:'x'.repeat(2001)}])await req(member,'/feedback','POST',data,400);
  await req(member,'/feedback?before=oops','GET',undefined,400);
  await db.batch(Array.from({length:51},(_,i)=>db.prepare('INSERT INTO feedback(user_id,kind,content,created_at) VALUES(?,?,?,?)').bind(member.id,'comment','Page '+i,new Date().toISOString())));
  list=await req(owner,'/feedback');assert.equal(list.posts.length,50);assert.ok(list.next);
  const page=await req(owner,'/feedback?before='+list.next);assert.equal(page.posts.length,4);assert.equal(page.next,null);assert.equal(new Set([...list.posts,...page.posts].map(p=>p.id)).size,54);
  assert.equal((await req(member,'/me/export')).feedback.length,54);
  await req(owner,`/feedback/${id}`,'DELETE',{});await req(owner,`/feedback/${id}`,'DELETE',{},404);
  for(let i=0;i<7;i++)await req(member,'/feedback','POST',{kind:'comment',content:'Limited '+i},201);
  await req(member,'/feedback','POST',{kind:'comment',content:'Excess'},429);
  await db.prepare('DELETE FROM platform_admins WHERE user_id=?').bind(owner.id).run();await req(owner,`/feedback/${list.posts[0].id}`,'DELETE',{},403);
  await req(member,'/me','DELETE',{});assert.equal((await req(other,'/feedback')).posts.length,0);
 }finally{await mf.dispose();}
});
