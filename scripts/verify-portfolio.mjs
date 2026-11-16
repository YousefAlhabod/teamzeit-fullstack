import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='https://yousef-alhabod.de',checks=[];
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const path of ['/style.css','/script.js','/assets/yousef-alhabod-portrait.png']){
 const res=await fetch(origin+path);assert.equal(res.status,200);
 assert.equal(hash(Buffer.from(await res.arrayBuffer())),hash(readFileSync('.private/portfolio'+path)));
 checks.push(`Original asset unchanged: ${path}`);
}
for(const path of ['/','/gaestebuch','/impressum','/datenschutz']){
 const res=await fetch(origin+path);assert.equal(res.status,200);checks.push(`Available: ${path}`);
 if(path==='/'&&process.argv.includes('--link'))assert.match(await res.text(),/id="teamzeit"/);
}
const config=await(await fetch(origin+'/api/config')).json();assert.equal(config.enabled,true);checks.push('Existing guestbook remains configured');
const comments=await(await fetch(origin+'/api/comments')).json();assert.ok(Array.isArray(comments.comments));checks.push('Existing guestbook API works');
writeFileSync('test-results/portfolio.json',JSON.stringify({at:new Date().toISOString(),checks,status:'passed'},null,2));
console.log(JSON.stringify({status:'passed',checks}));
