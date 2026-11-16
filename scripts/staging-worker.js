import app from '../src/worker.js';
import {safeEqual} from '../src/core.js';
export default {async fetch(request,env){
 if(!env.STAGING_ACCESS_KEY||!safeEqual(request.headers.get('X-Teamzeit-Staging-Key'),env.STAGING_ACCESS_KEY))return new Response('Private performance staging',{status:403});
 const headers=new Headers(request.headers),ip=headers.get('X-Teamzeit-Virtual-IP');
 if(ip&&/^198\.18\.[0-9]{1,3}\.[0-9]{1,3}$/.test(ip))headers.set('cf-connecting-ip',ip);
 headers.delete('X-Teamzeit-Staging-Key');headers.delete('X-Teamzeit-Virtual-IP');
 let queries=0,dbMs=0,sqlMs=0,reads=0,writes=0,dbError='';
 async function measure(fn){const t=performance.now();queries++;try{const result=await fn();const metas=Array.isArray(result)?result:[result];for(const r of metas){sqlMs+=Number(r?.meta?.timings?.sql_duration_ms||0);reads+=Number(r?.meta?.rows_read||0);writes+=Number(r?.meta?.rows_written||0);}return result;}catch(error){dbError=String(error).slice(0,200);throw error;}finally{dbMs+=performance.now()-t;}}
 const db={prepare(sql){const p=env.DB.prepare(sql);const wrap=s=>({bind(...v){return wrap(s.bind(...v));},async first(column){const r=await measure(()=>s.all());return column?r.results[0]?.[column]??null:r.results[0]??null;},all(...a){return measure(()=>s.all(...a));},run(...a){return measure(()=>s.run(...a));},raw(...a){return measure(()=>s.raw(...a));},_statement:s});return wrap(p);},batch(statements){return measure(()=>env.DB.batch(statements.map(s=>s._statement||s)));}};
 const start=performance.now();
 const response=await app.fetch(new Request(request,{headers}),{...env,DB:db,RESEND_API_KEY:undefined,RESEND_SETUP_KEY:undefined,MAIL_FROM:undefined,ASSETS:{fetch:async()=>new Response('Not found',{status:404})}});
 const out=new Headers(response.headers);out.set('Server-Timing',`app;dur=${(performance.now()-start).toFixed(1)},db;dur=${dbMs.toFixed(1)},sql;dur=${sqlMs.toFixed(1)}`);out.set('X-Staging-Queries',String(queries));
 out.set('X-Staging-Rows-Read',String(reads));out.set('X-Staging-Rows-Written',String(writes));
 if(dbError)out.set('X-Staging-DB-Error',encodeURIComponent(dbError));
 return new Response(response.body,{status:response.status,headers:out});
}};
