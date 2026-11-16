import {cloudflare,account} from './cloudflare-client.mjs';
const root=`accounts/${account}/workers/scripts/teamzeit-app`;
const listing=await cloudflare(root+'/versions');
const versions=listing.items||listing;
for(const version of versions.slice(0,6)){
 const detail=await cloudflare(root+'/versions/'+version.id);
 console.log(JSON.stringify({id:version.id,created:version.metadata?.created_on,source:version.metadata?.source,bindings:(detail.resources?.bindings||detail.bindings||[]).map(b=>({name:b.name,type:b.type}))}));
}
const deployments=await cloudflare(root+'/deployments');
console.log(JSON.stringify({deployments:(deployments.deployments||deployments).slice(0,2).map(x=>({id:x.id,versions:x.versions}))}));
