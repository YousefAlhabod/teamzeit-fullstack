import {readFileSync,writeFileSync} from 'node:fs';
const path='.private/test-access.json',data=JSON.parse(readFileSync(path));
const res=await fetch('https://teamzeit.yousef-alhabod.de/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupToken:data.setupToken,name:'Test Trainer',email:data.email,password:data.password,groupName:'TeamZeit Funktionstest'})});
const body=await res.json();console.log(JSON.stringify({status:res.status,...body}));
if(!res.ok)process.exitCode=1;
else {data.cookie=res.headers.get('set-cookie').split(';')[0];writeFileSync(path,JSON.stringify(data),{mode:0o600});}
