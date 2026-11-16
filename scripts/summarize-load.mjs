import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [path,name]=process.argv.slice(2);if(!path||!name||!/^[a-z0-9-]+$/.test(name))throw Error('Usage: node scripts/summarize-load.mjs test-results/report.json summary-name');
const raw=readFileSync(path),report=JSON.parse(raw);delete report.samples;
report.rawFile=path.replaceAll('\\','/');report.rawSha256=createHash('sha256').update(raw).digest('hex');
mkdirSync('docs/performance',{recursive:true});writeFileSync(`docs/performance/${name}.json`,JSON.stringify(report,null,2)+'\n');
console.log('Saved versioned measurements without individual samples:',name);
