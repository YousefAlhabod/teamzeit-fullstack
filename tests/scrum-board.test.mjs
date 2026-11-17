import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scrumBoard} from '../public/scrum.js';
test('Scrum UI displays every project member, simultaneous cards and independent member/status filters',async()=>{
 const root={innerHTML:''},members=[{id:'a',name:'Anna',role:'developer'},{id:'b',name:'Berta',role:'stakeholder'},{id:'c',name:'Chris',role:'product_owner'}];
 const tasks=[{id:'1',title:'Anna offen',description:'A',assigneeId:'a',status:'todo',version:1},{id:'2',title:'Berta offen',description:'B',assigneeId:'b',status:'todo',version:1},{id:'3',title:'Anna Arbeit',description:'C',assigneeId:'a',status:'in_progress',version:1},{id:'4',title:'Chris Review',description:'D',assigneeId:'c',status:'review',version:1},{id:'5',title:'Berta fertig',description:'E',assigneeId:'b',status:'done',version:1}];
 const call=async(path,method,body)=>{
  if(method==='PATCH'){const t=tasks.find(t=>path.endsWith('/'+t.id));assert.equal(body.version,t.version);t.status=body.status;t.version++;return {ok:true};}
  if(path==='/scrum/projects')return {projects:[{id:'project',name:'Projekt',role:'project_admin'}]};
  return path.endsWith('/members')?{members}:{tasks};
 };
 await scrumBoard({root,call,user:{id:'a'},notify:m=>assert.fail(m),onBack:()=>{}});
 assert.match(root.innerHTML,/>Person auswählen</);assert.match(root.innerHTML,/<select name="assigneeId" required>/);assert.match(root.innerHTML,/<textarea name="description"[^>]*required/);
 for(const m of members)assert.ok(root.innerHTML.includes(`${m.name} ·`));
 assert.match(root.innerHTML,/Offen \(2\)/);for(const t of tasks)assert.ok(root.innerHTML.includes(t.title));
 await root.onchange({target:{id:'scrum-member-filter',value:'a'}});
 assert.match(root.innerHTML,/Offen \(1\)/);assert.ok(root.innerHTML.includes('Anna offen'));assert.ok(root.innerHTML.includes('Anna Arbeit'));assert.ok(!root.innerHTML.includes('Berta offen'));assert.ok(!root.innerHTML.includes('Chris Review'));
 await root.onchange({target:{id:'scrum-member-filter',value:''}});assert.match(root.innerHTML,/Offen \(2\)/);
 await root.onchange({target:{dataset:{scrumTask:'1'},value:'done'}});
 assert.equal(tasks[0].status,'done');assert.equal(tasks[1].status,'todo');assert.match(root.innerHTML,/Offen \(1\)/);assert.match(root.innerHTML,/Erledigt \(2\)/);
 await root.onchange({target:{id:'scrum-member-filter',value:'b'}});assert.ok(root.innerHTML.includes('Berta offen'));assert.ok(root.innerHTML.includes('Berta fertig'));assert.ok(!root.innerHTML.includes('Anna offen'));
});
