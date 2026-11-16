import {cloudflare,account} from './cloudflare-client.mjs';
const path=`accounts/${account}/d1/database/eba63996-3ef2-47b1-bca1-c2bdb01d57de/query`;
async function run(sql){return (await cloudflare(path,{method:'POST',body:JSON.stringify({sql})}))[0];}
const guard=await run("SELECT COUNT(*) n FROM users WHERE email NOT LIKE 'perf-%@example.invalid'");if(guard.results[0].n)throw Error('Refusing to reset a database containing non-fixture accounts.');
for(const table of ['responses','sessions','request_limits','login_attempts','notification_outbox'])await run(`DELETE FROM ${table}`);
console.log('Only isolated staging responses and sessions reset; fixture accounts retained.');
