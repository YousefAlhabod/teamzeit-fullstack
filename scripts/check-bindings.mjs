import {cloudflare,account} from './cloudflare-client.mjs';
const scripts=await cloudflare(`accounts/${account}/workers/scripts`);
for(const script of scripts.filter(x=>x.id.toLowerCase().includes('teamzeit'))){
 const settings=await cloudflare(`accounts/${account}/workers/scripts/${script.id}/settings`);
 console.log(JSON.stringify({worker:script.id,bindings:(settings.bindings||[]).map(x=>({name:x.name,type:x.type}))}));
}
const domains=await cloudflare(`accounts/${account}/workers/domains`);
console.log(JSON.stringify({domains:domains.filter(x=>x.hostname==='teamzeit.yousef-alhabod.de').map(x=>({hostname:x.hostname,service:x.service,environment:x.environment}))}));
