import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const path='.private/portfolio/index.html';let html=readFileSync(path,'utf8');
if(html.includes('id="teamzeit"')){console.log('Portfolio link already prepared');process.exit(0);}
if(!existsSync('.private/portfolio-original-index.html'))writeFileSync('.private/portfolio-original-index.html',html);
const ending='</article>\r\n</div>\r\n<div class="web-project"';
if(!html.includes(ending))throw Error('Portfolio structure changed; review required');
const addition=['</article>',
'<article class="card" id="teamzeit">',
'<p class="eyebrow">TeamZeit / Full-Stack-Portfolio-Projekt</p>',
'<h3>Training gemeinsam organisieren.</h3>',
'<p>Trainingstermine, Einladungen und Teilnahmeentscheidungen mit geschützten Trainer- und Mitgliederrollen. Die interaktive Demo ist ohne Anmeldung verfügbar.</p>',
'<p>Eigenständige Full-Stack-Weiterentwicklung eines gemeinsam erarbeiteten Scrum-Kurskonzepts. Die ursprünglichen Teamrollen und Beiträge bleiben auf der Projektseite getrennt ausgewiesen.</p>',
'<ul class="tags"><li>JavaScript</li><li>Cloudflare Workers</li><li>D1 / SQL</li><li>API &amp; Testing</li></ul>',
'<a class="button" href="https://teamzeit.yousef-alhabod.de/" target="_blank" rel="noopener noreferrer">TeamZeit &amp; Demo öffnen ↗</a>',
'</article>','</div>','<div class="web-project"'].join('\r\n');
html=html.replace(ending,addition);writeFileSync(path,html);
console.log('Prepared one TeamZeit project card; existing sections preserved');
