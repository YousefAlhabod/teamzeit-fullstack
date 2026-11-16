import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const base='https://teamzeit.yousef-alhabod.de';
const seed=JSON.parse(readFileSync('.private/test-access.json'));
let cookie='';
async function request(path,method='GET',body){
 const res=await fetch(base+'/api'+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await res.json();if(!res.ok)throw Error(data.error);if(res.headers.has('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return data;
}
await request('/auth/login','POST',{email:seed.email,password:seed.password});
const me=await request('/me');
const group=me.groups.find(x=>x.name==='TeamZeit Funktionstest'||x.name==='Die wilden Waden');
if(!group)throw Error('Initial group not found; do not create duplicate');
await request(`/groups/${group.id}`,'PATCH',{name:'Die wilden Waden',description:'Trainingsorganisation für eine Freizeitsportgruppe'});
if(!existsSync('.private/owner-invitation.json')){
 const invite=await request(`/groups/${group.id}/invites`,'POST',{role:'trainer'});
 writeFileSync('.private/owner-invitation.json',JSON.stringify({...invite,groupId:group.id}),{mode:0o600});
}
await request('/auth/logout','POST',{});
const invite=JSON.parse(readFileSync('.private/owner-invitation.json'));
console.log(JSON.stringify({inviteUrl:invite.inviteUrl,expiresAt:invite.expiresAt,uses:1,role:'trainer'}));
