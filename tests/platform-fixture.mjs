import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {scryptSync,randomBytes,createHash,randomUUID} from 'node:crypto';
export async function fixture(options={}){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[...['worker','core','email-invites','platform','project-page'].map(n=>({type:'ESModule',path:`src/${n}.js`})),{type:'ESModule',path:'public/time.js'}],compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{REGISTRATION_ENABLED:'true',RATE_LIMIT_SECRET:'isolated-tests-only',...options.bindings},...options}));
 const db=await mf.getD1Database('DB');
 for(const name of readdirSync('migrations').sort()){
  const sql=readFileSync(`migrations/${name}`,'utf8').replace(/--[^\n]*/g,'');
  const statements=sql.match(/CREATE TRIGGER[\s\S]*?END;|[^;]+;/g)||[];
  for(let i=0;i<statements.length;i++){let s=statements[i];if(s.includes('CREATE TRIGGER')&&!s.includes('END;'))s+=statements[++i];await db.prepare(s).run();}
 }
 const password='Isolated-Load-Test-Password!2026',salt=randomBytes(16).toString('hex');
 const hash='scrypt-v1$'+scryptSync(password,Buffer.from(salt,'hex'),32,{N:16384,r:8,p:5,maxmem:64*1024*1024}).toString('hex');
 async function user(name,index=0){
  const id=randomUUID(),email=`${name}-${index}@example.invalid`,token=randomBytes(32).toString('hex');
  await db.batch([db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(id,name,email,hash,salt),db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,new Date(Date.now()+86400000).toISOString())]);
  return {id,email,password,cookie:`teamzeit_session=${token}`};
 }
 async function request(client,path,method='GET',body){return mf.dispatchFetch('http://localhost'+path,{method,headers:{...(client?.cookie?{Cookie:client.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),'cf-connecting-ip':client?.ip||'198.18.0.1'},body:body===undefined?undefined:JSON.stringify(body)});}
 return {mf,db,user,request,password,salt,hash};
}
