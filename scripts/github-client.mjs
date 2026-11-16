import {execFileSync} from 'node:child_process';
export function githubToken(){
 try{return execFileSync('tooling/gh/bin/gh.exe',['auth','token'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch{}
 const output=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}});
 const password=output.split(/\r?\n/).find(x=>x.startsWith('password='))?.slice(9);
 if(!password)throw Error('GitHub authentication required');return password;
}
export async function github(path,options={}){
 const res=await fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${githubToken()}`,'X-GitHub-Api-Version':'2022-11-28',...options.headers}});
 const data=await res.json();if(!res.ok)throw Error(`GitHub ${res.status}: ${data.message}`);return data;
}
if(process.argv[2]==='check'){
 try{const user=await github('/user');console.log(JSON.stringify({login:user.login}));}catch(e){console.error(e.message);process.exitCode=1;}
}
