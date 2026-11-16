import {fixture} from '../tests/platform-fixture.mjs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {cpus,totalmem,platform,release} from 'node:os';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=')[1];
const n=Number(arg('users')||1000),ramp=Number(arg('ramp')||60);
if(!Number.isInteger(n)||n<10||n>1000||!Number.isFinite(ramp)||ramp<1||ramp>120)throw Error('Use --users=10..1000 --ramp=1..120. No remote targets are supported.');
const f=await fixture(),{mf,db}=f,users=[],groups=[],samples=[],invariants=[],started=performance.now();let inFlight=0,maxInFlight=0,monitor;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jitter=(i,r)=>((i*7919+r*104729)%4501)+500;
const summary=rows=>{const a=rows.map(x=>x.ms).sort((a,b)=>a-b),p=q=>Math.round(a[Math.max(0,Math.ceil(a.length*q)-1)]||0),errors=rows.filter(x=>!x.ok).length;return {requests:rows.length,errors,errorPercent:rows.length?+(errors*100/rows.length).toFixed(3):0,p50:p(.5),p95:p(.95),p99:p(.99),max:p(1),targetMet:!!rows.length&&p(.95)<2000&&errors/rows.length<.01};};
async function timed(c,path,method,body,operation,expected=200){
 const start=performance.now();inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);let status=0,data,error;
 try{const r=await f.request(c,path,method,body);status=r.status;data=await r.json();if(operation==='login'&&status===200)c.cookie=r.headers.get('set-cookie')?.split(';')[0];if(status!==expected)error=data.error;}catch(e){error=String(e).slice(0,160);}
 finally{inFlight--;samples.push({operation,status,error,ok:status===expected,ms:+(performance.now()-start).toFixed(2)});}return data;
}
try{
 const locations=Array.from({length:3},()=>randomUUID());
 await db.batch(locations.map((id,i)=>db.prepare('INSERT INTO locations(id,name,city) VALUES(?,?,?)').bind(id,['Hannover','Berlin','Hamburg'][i],['Hannover','Berlin','Hamburg'][i])));
 for(let i=0;i<n;i++)users.push({id:randomUUID(),email:`load-${i}@example.invalid`,ip:`198.18.${Math.floor(i/250)}.${i%250+1}`,password:f.password});
 for(let i=0;i<n;i+=40)await db.batch(users.slice(i,i+40).map(u=>db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(u.id,'Lasttest',u.email,f.hash,f.salt)));
 const groupCount=Math.min(50,Math.ceil(n/20));
 for(let i=0;i<groupCount;i++){
  const g={id:randomUUID(),events:Array.from({length:12},()=>randomUUID())};groups.push(g);
  await db.prepare('INSERT INTO groups(id,name,description,created_by,location_id) VALUES(?,?,?,?,?)').bind(g.id,`Testgruppe ${i}`,'Nur isolierte Testdaten',users[i*20].id,locations[i%3]).run();
  await db.batch(g.events.map((id,j)=>db.prepare('INSERT INTO training_events(id,group_id,title,start_at,location,notes,created_by,capacity) VALUES(?,?,?,?,?,?,?,?)').bind(id,g.id,`Testtraining ${j}`,`2027-12-${String(j+1).padStart(2,'0')}T17:30:00.000Z`,'Testhalle','',users[i*20].id,8)));
 }
 for(let i=0;i<n;i+=40)await db.batch(users.slice(i,i+40).map((u,j)=>{const index=i+j;u.group=groups[Math.floor(index/20)];return db.prepare('INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,?)').bind(u.group.id,u.id,index%20===0?'trainer':'member');}));
 console.log(`Isolated fixture ready: ${n} users, ${groupCount} groups, ${groupCount*12} events. Real email unavailable.`);
 const loginStart=performance.now();
 await Promise.all(users.map(async(u,i)=>{await sleep(i*ramp*1000/n);await timed(u,'/api/auth/login','POST',{email:u.email,password:u.password},'login');}));
 const loginSeconds=(performance.now()-loginStart)/1000,loginSuccess=users.filter(u=>u.cookie).length,seeded=n-loginSuccess;
 for(const u of users.filter(u=>!u.cookie)){
  const token=randomBytes(32).toString('hex');u.cookie=`teamzeit_session=${token}`;
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),u.id,new Date(Date.now()+86400000).toISOString()).run();
 }
 const active=users;
 console.log(`Login ramp complete: ${loginSuccess}/${n} logins, ${loginSeconds.toFixed(1)}s; ${seeded} isolated fixture sessions added after failed logins. Starting ${active.length} active users.`);
 monitor=setInterval(async()=>{try{const bad=await db.prepare("SELECT e.id FROM training_events e JOIN responses r ON r.event_id=e.id AND r.booking_state='confirmed' WHERE e.capacity IS NOT NULL GROUP BY e.id HAVING COUNT(*)>e.capacity LIMIT 1").first();if(bad)invariants.push('overbooking');}catch{invariants.push('monitor_failed');}},1000);
 const mixedStart=performance.now();
 await Promise.all(active.map(async(u,i)=>{
  for(let r=0;r<6;r++){
   await sleep(jitter(i,r));
   if(r===0||r===2)await timed(u,`/api/groups/${u.group.id}/events`,'GET',undefined,'events');
   else await timed(u,`/api/events/${u.group.events[0]}/rsvp`,'POST',{status:r===3?'maybe':r===5?'no':'yes'},r===5?'cancel':r===3?'maybe':'book');
  }
  const other=groups[(Math.floor(i/20)+1)%groups.length];if(other.id!==u.group.id)await timed(u,`/api/groups/${other.id}/events`,'GET',undefined,'security',403);
 }));
 const mixedSeconds=(performance.now()-mixedStart)/1000;
 const hotGroup=randomUUID(),hotEvent=randomUUID();
 await db.prepare('INSERT INTO groups(id,name,created_by) VALUES(?,?,?)').bind(hotGroup,'Isolated contention test',users[0].id).run();
 for(let i=0;i<n;i+=40)await db.batch(users.slice(i,i+40).map(u=>db.prepare('INSERT INTO memberships(group_id,user_id,role) VALUES(?,?,?)').bind(hotGroup,u.id,'member')));
 await db.prepare('INSERT INTO training_events(id,group_id,title,start_at,location,created_by,capacity) VALUES(?,?,?,?,?,?,?)').bind(hotEvent,hotGroup,'Contention','2027-12-15T17:30:00.000Z','Testhalle',users[0].id,Math.min(50,n)).run();
 const contentionStart=performance.now();await Promise.all(active.map(u=>timed(u,`/api/events/${hotEvent}/rsvp`,'POST',{status:'yes'},'contention')));const contentionSeconds=(performance.now()-contentionStart)/1000;
 clearInterval(monitor);monitor=null;
 const hot=(await db.prepare('SELECT booking_state,COUNT(*) n FROM responses WHERE event_id=? GROUP BY booking_state').bind(hotEvent).all()).results;
 const confirmed=hot.find(x=>x.booking_state==='confirmed')?.n||0,waiting=hot.find(x=>x.booking_state==='waitlisted')?.n||0;
 if(confirmed!==Math.min(50,active.length)||confirmed+waiting!==active.length)invariants.push('contention_count_mismatch');
 const plans={events:await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM training_events WHERE group_id=? AND start_at>=? ORDER BY start_at LIMIT 150').bind(groups[0].id,'2027').all(),queue:await db.prepare("EXPLAIN QUERY PLAN SELECT user_id FROM responses WHERE event_id=? AND booking_state='waitlisted' ORDER BY queued_at,user_id LIMIT 1").bind(hotEvent).all()};
 const operations=Object.fromEntries([...new Set(samples.map(x=>x.operation))].map(op=>[op,summary(samples.filter(x=>x.operation===op))]));
 const report={at:new Date().toISOString(),environment:{kind:'isolated local Miniflare + workerd + D1 SQLite',platform:platform(),release:release(),node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGB:+(totalmem()/2**30).toFixed(1),uvThreadpool:process.env.UV_THREADPOOL_SIZE||'default (4)',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHash:createHash('sha256').update(['src/worker.js','src/platform.js','migrations/0005_regional_training.sql'].map(p=>readFileSync(p,'utf8')).join('\n')).digest('hex')},scenario:{users:n,activeUsers:active.length,loginSuccess,fixtureSessionsAfterFailedLogins:seeded,groups:groupCount,events:groupCount*12,rampSeconds:ramp,loginSeconds:+loginSeconds.toFixed(2),mixedSeconds:+mixedSeconds.toFixed(2),contentionSeconds:+contentionSeconds.toFixed(2),maxInFlight,thinkMs:'deterministic 500..5000',realMail:false,remoteDatabase:false},operations,overall:summary(samples.filter(x=>x.operation!=='security')),invariants:{violations:invariants,hotConfirmed:confirmed,hotWaitlisted:waiting},queryPlans:plans,production1000UsersProven:false,totalSeconds:+((performance.now()-started)/1000).toFixed(2),samples};
 mkdirSync('test-results',{recursive:true});const path=`test-results/load-${n}-${Date.now()}.json`;writeFileSync(path,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,samples:undefined,queryPlans:undefined},null,2));console.log('Detailed measurements:',path);
 if(loginSuccess!==n||invariants.length||Object.values(operations).some(x=>!x.targetMet))process.exitCode=2;
}finally{if(monitor)clearInterval(monitor);await mf.dispose();}
