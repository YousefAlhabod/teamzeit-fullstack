import {readFileSync,writeFileSync} from 'node:fs';
import {cloudflare} from './cloudflare-client.mjs';
const setup=JSON.parse(readFileSync('.private/test-access.json'));
const zone='45355279f3113b09add21a52251a249c';
async function mail(action,extra={}){
 const res=await fetch('https://teamzeit.yousef-alhabod.de/api/admin/mail-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,setupToken:setup.setupToken,...extra})});
 const data=await res.json();if(!res.ok)throw Error(JSON.stringify(data));return data.result;
}
const domains=await mail('list');
let domain=(domains.data||[]).find(x=>x.name==='mail.teamzeit.yousef-alhabod.de');
if(!domain)domain=await mail('create');
domain=await mail('get',{domainId:domain.id});
for(const record of domain.records||[]){
 let name=record.name;
 if(!name.endsWith('yousef-alhabod.de'))name+='.'+'mail.teamzeit.yousef-alhabod.de';
 if(!name.endsWith('.mail.teamzeit.yousef-alhabod.de')&&name!=='mail.teamzeit.yousef-alhabod.de')throw Error('Refusing DNS change outside isolated mail subdomain');
 const existing=await cloudflare(`zones/${zone}/dns_records?name=${encodeURIComponent(name)}&type=${record.type}`);
 if(existing.some(x=>x.content===record.value||x.content===record.value+'.'))continue;
 if(existing.length)throw Error(`Conflicting record ${name}; review required`);
 const body={type:record.type,name,content:record.value,ttl:1};
 if(record.type==='MX')body.priority=record.priority||10;
 await cloudflare(`zones/${zone}/dns_records`,{method:'POST',body:JSON.stringify(body)});
 console.log(`Created ${record.type} ${name}`);
}
await mail('verify',{domainId:domain.id});
const current=await mail('get',{domainId:domain.id});
writeFileSync('.private/mail-domain.json',JSON.stringify(current,null,2));
console.log(JSON.stringify({id:current.id,name:current.name,status:current.status}));
if(process.argv.includes('--test')){
 if(current.status!=='verified')throw Error('Sender domain not yet verified; no message sent');
 const sent=await mail('test');writeFileSync('.private/mail-test.json',JSON.stringify(sent));console.log(JSON.stringify({sentId:sent.id}));
}
if(process.argv.includes('--delivery')){
 const sent=JSON.parse(readFileSync('.private/mail-test.json'));
 const result=await mail('delivery',{emailId:sent.id});console.log(JSON.stringify({id:result.id,lastEvent:result.last_event}));
}
