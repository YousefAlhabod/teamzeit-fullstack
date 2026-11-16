import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {cloudflare,account} from './cloudflare-client.mjs';
mkdirSync('.private',{recursive:true});
const path='.private/test-access.json';
const data=existsSync(path)?JSON.parse(readFileSync(path)): {setupToken:randomBytes(32).toString('hex'),rateSecret:randomBytes(32).toString('hex'),password:randomBytes(24).toString('base64url')+'!Test9',email:'trainer-e2e@example.invalid'};
writeFileSync(path,JSON.stringify(data),{mode:0o600});
for(const [name,text] of [['SETUP_TOKEN',data.setupToken],['RATE_LIMIT_SECRET',data.rateSecret]]){
 await cloudflare(`accounts/${account}/workers/scripts/teamzeit-app/secrets`,{method:'PUT',body:JSON.stringify({name,text,type:'secret_text'})});
 console.log(`${name} configured (value hidden)`);
}
