import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const account='9be816f99da25a8e3e7060c22f5fdb26';
export async function cloudflare(path,options={}){
 const config=readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
 const token=config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
 if(!token)throw Error('Wrangler login required');
 const res=await fetch(`https://api.cloudflare.com/client/v4/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});
 const data=await res.json();if(!res.ok||!data.success)throw Error(`Cloudflare ${res.status}: ${JSON.stringify(data.errors)}`);return data.result;
}
