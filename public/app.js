import {berlinToUtc} from './time.js';
const root=document.getElementById('app-root');
const modal=document.getElementById('modal');
const modalContent=document.getElementById('modal-content');
const toastNode=document.getElementById('toast');
const state={mode:null,user:null,group:null,groups:[],events:[],members:[],demoRole:'trainer',panel:'events',invite:null,emailInvitations:[],invitePreview:null,loading:false};
const incoming=new URLSearchParams(location.hash.slice(1));
let incomingInvite=incoming.get('invite')||'';
let resetToken=incoming.get('reset')||'';
if(incomingInvite||resetToken)history.replaceState(null,'',location.pathname+location.search);
const demoKey='teamzeit-demo-v1';
const testEvents=[
  {id:'demo-01',groupId:'demo',title:'Vereinstraining',startAt:'2026-11-18T17:30:00.000Z',location:'Sporthalle',notes:'Treffpunkt 10 Minuten früher.',myResponse:'yes',people:[{name:'Vanessa',status:'yes'},{name:'Suzana',status:'yes'},{name:'Stefan',status:'no'},{name:'Yousef',status:'yes'},{name:'Ünal',status:'maybe'}]},
  {id:'demo-02',groupId:'demo',title:'Technik & Koordination',startAt:'2026-11-20T18:00:00.000Z',location:'Sportplatz Nord',notes:'Bitte Sportschuhe mitbringen.',myResponse:null,people:[{name:'Vanessa',status:'maybe'},{name:'Suzana',status:'yes'},{name:'Stefan',status:'yes'},{name:'Yousef',status:'open'},{name:'Ünal',status:'no'}]},
  {id:'demo-03',groupId:'demo',title:'Freizeitspiel',startAt:'2026-11-23T17:30:00.000Z',location:'Sporthalle',notes:'Offenes Gruppentraining.',myResponse:'maybe',people:[{name:'Vanessa',status:'yes'},{name:'Suzana',status:'open'},{name:'Stefan',status:'open'},{name:'Yousef',status:'maybe'},{name:'Ünal',status:'yes'}]}
];
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=iso=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date(iso));
const inputDate=iso=>{const d=new Date(iso);return new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Berlin'}).format(d).replace(' ','T');};
const myName=()=>state.mode==='demo'?'Yousef':state.user?.name||'Mitglied';
const userRole=()=>state.mode==='demo'?state.demoRole:state.group?.role;
const isTrainer=()=>userRole()==='trainer';
function notify(message,error=false){toastNode.textContent=message;toastNode.className='toast show'+(error?' error':'');clearTimeout(notify.t);notify.t=setTimeout(()=>toastNode.className='toast',3800)}
async function call(path,method='GET',payload){
  const options={method,headers:{}};
  if(payload!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(payload)}
  let res;
  try{res=await fetch('/api'+path,options)}catch{throw Error('Keine Verbindung zum Server. Ist die App bereitgestellt?')}
  let data;try{data=await res.json()}catch{throw Error('Unerwartete Serverantwort.')}
  if(!res.ok)throw Error(data.error||'Anfrage fehlgeschlagen.');
  return data;
}
const defaultDemo=()=>JSON.parse(JSON.stringify(testEvents));
function loadDemo(){
  try{const stored=JSON.parse(localStorage.getItem(demoKey)||'null');if(Array.isArray(stored)&&stored.length<=50)return stored}
  catch{}
  return defaultDemo();
}
function saveDemo(){try{localStorage.setItem(demoKey,JSON.stringify(state.events))}catch{}}
function withCounts(event){
  const counts={yes:0,no:0,maybe:0};for(const p of event.people||[])if(p.status in counts)counts[p.status]++;
  return {...event,counts};
}
function startDemo(){
  state.invite=null;state.emailInvitations=[];state.invitePreview=null;
  state.mode='demo';state.user={id:'demo-user',name:'Yousef (Demo)',email:'demo@teamzeit.example'};
  state.group={id:'demo',name:'Die wilden Waden (Demo)',role:'trainer'};
  state.events=loadDemo();state.demoRole='trainer';state.panel='events';renderApp();scrollApp();
}
function scrollApp(){document.getElementById('app').scrollIntoView({behavior:'smooth',block:'start'})}
function openDialog(html){modalContent.innerHTML=html;const title=modalContent.querySelector('h3');if(title)title.id='modal-title';if(!modal.open)modal.showModal()}
function closeDialog(){if(modal.open)modal.close()}
function errorIn(node,message){const alert=node.querySelector('[data-form-error]');if(alert){alert.textContent=message;alert.hidden=false}else notify(message,true)}
async function showAuth(mode='login'){
  state.mode=null;state.panel=mode;
  renderAuth();scrollApp();
}
async function renderAuth(){
  document.getElementById('nav-auth').textContent='Anmelden';
  let initialized=true;
  let registrationEnabled=true;
  try{const setup=await call('/setup/status');initialized=setup.initialized;registrationEnabled=setup.registrationEnabled;}catch{}
  if(state.panel==='setup' || !initialized)state.panel='setup';
  const m=state.panel;
  if(incomingInvite&&['register','login'].includes(m)){
    try{state.invitePreview=await call('/invites/preview','POST',{inviteCode:incomingInvite});}
    catch(error){root.innerHTML=`<div class="auth-pane"><h3>Einladung nicht verfügbar</h3><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" data-action="auth-login-clear">Zur Anmeldung</button><button class="link-button" data-action="start-demo">Demo öffnen</button></div>`;return;}
    if(m==='register'){
      let me;try{me=await call('/me')}catch{}
      if(me?.user&&(!state.invitePreview.email||me.user.email===state.invitePreview.email)){
        state.user=me.user;root.innerHTML=`<div class="auth-pane"><h3>Einladung zu ${escapeHtml(state.invitePreview.groupName)}</h3><p>Angemeldet als ${escapeHtml(me.user.name)} (${escapeHtml(me.user.email)}).</p><p>Mit der Annahme trittst du dieser Gruppe bei. Trainer sehen deinen Anzeigenamen und deine Teilnahmeantworten.</p><button class="btn btn-primary" data-action="accept-invite">Einladung annehmen</button><p><a href="/datenschutz.html">Datenschutzhinweise</a></p></div>`;return;
      }
    }
  }
  if(m==='forgot'||m==='reset'){
    root.innerHTML=`<div class="auth-pane"><h3>${m==='forgot'?'Passwort vergessen?':'Neues Passwort festlegen'}</h3><form class="form-stack" id="auth-form" data-form="${m}">${m==='forgot'?'<label>E-Mail<input name="email" type="email" autocomplete="email" required></label>':'<label>Neues Passwort<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>'}<p class="inline-alert" data-form-error hidden></p><button class="btn btn-primary" type="submit">${m==='forgot'?'Link anfordern':'Passwort speichern'}</button></form><button class="link-button" data-action="auth-login">Zur Anmeldung</button></div>`;return;
  }
  const isLogin=m==='login',isRegister=m==='register',isSetup=m==='setup';
  const title=isSetup?'Erste Gruppe einrichten':isRegister?'Mit Einladung beitreten':'Willkommen zurück';
  const sub=isSetup?'Einmalige Einrichtung auf dem eigenen Cloudflare-Projekt.':isRegister?(state.invitePreview?`Einladung zur Gruppe ${escapeHtml(state.invitePreview.groupName)}. Nach der Registrierung bist du automatisch Mitglied.`:'Einladungscode vom Trainer benötigt.'):'Melden Sie sich mit Ihrem TeamZeit-Konto an.';
  root.innerHTML=`<div class="auth-pane"><h3>${title}</h3><p>${sub}</p><form class="form-stack" id="auth-form" data-form="${m}">
    ${!isLogin?'<label>Name<input name="name" autocomplete="name" maxlength="80" required></label>':''}
    <label>E-Mail<input type="email" name="email" autocomplete="email" maxlength="254" value="${escapeHtml(incomingInvite?state.invitePreview?.email||'':'')}" ${incomingInvite&&state.invitePreview?.email?'readonly':''} required></label>
    <label>Passwort<input name="password" type="password" autocomplete="${isLogin?'current-password':'new-password'}" minlength="${isLogin?1:12}" required></label>
    ${isRegister?`<label>Einladungscode<input name="inviteCode" value="${escapeHtml(incomingInvite)}" spellcheck="false" autocomplete="off" required></label><label class="checkbox-label"><input name="privacyAccepted" type="checkbox" required> Ich habe die <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweise</a> gelesen. Keine Gesundheitsdaten eingeben.</label>${!registrationEnabled?'<p>Neue Konten sind derzeit noch nicht freigeschaltet. Die Demo ist sofort verfügbar.</p>':''}`:''}
    ${isSetup?'<label>Einrichtungscode (SETUP_TOKEN)<input name="setupToken" type="password" required></label><label>Name der Sportgruppe<input name="groupName" value="Die wilden Waden" required maxlength="80"></label>':''}
    <p class="inline-alert" data-form-error hidden></p><button class="btn btn-primary" type="submit">${isLogin?'Anmelden':isRegister?'Registrieren':'Gruppe einrichten'}</button></form>
    <div class="auth-toggle">${isLogin?'<button class="link-button" data-action="auth-forgot">Passwort vergessen?</button>':''}${!isSetup?`<button class="link-button" data-action="auth-${isLogin?'register':'login'}">${isLogin?'Einladung erhalten? Registrieren':'Bereits registriert? Anmelden'}</button>`:''}<button class="link-button" data-action="start-demo">Ohne Anmeldung testen</button></div></div>`;
}
async function loadLive(){
 const me=await call('/me');state.user=me.user;state.groups=me.groups;state.group=me.groups.find(g=>g.id===state.group?.id)||me.groups[0]||null;state.mode='live';state.panel='events';state.invite=null;state.emailInvitations=[];
 if(state.group){const events=await call(`/groups/${state.group.id}/events`);state.events=events.events}else state.events=[];
 renderApp();scrollApp();
}
const counts=ev=>state.mode==='demo'?withCounts(ev).counts:ev.counts||{yes:0,no:0,maybe:0};
const statusName={yes:'Zusage',no:'Absage',maybe:'Vielleicht',open:'Noch offen'};
function renderEvent(ev){
 const c=counts(ev),trainer=isTrainer();
 return `<article class="event-card"><div class="event-date">${escapeHtml(formatDate(ev.startAt))}</div><h4>${escapeHtml(ev.title)}</h4><p class="event-place">⌖ ${escapeHtml(ev.location)}</p>${ev.notes?`<p class="event-notes">${escapeHtml(ev.notes)}</p>`:''}
 <div class="rsvp-row"><button class="choice yes ${ev.myResponse==='yes'?'active':''}" data-action="rsvp" data-id="${ev.id}" data-status="yes" aria-pressed="${ev.myResponse==='yes'}">✓ Dabei</button><button class="choice no ${ev.myResponse==='no'?'active':''}" data-action="rsvp" data-id="${ev.id}" data-status="no" aria-pressed="${ev.myResponse==='no'}">✕ Absage</button><button class="choice maybe ${ev.myResponse==='maybe'?'active':''}" data-action="rsvp" data-id="${ev.id}" data-status="maybe" aria-pressed="${ev.myResponse==='maybe'}">? Vielleicht</button></div>
 <div class="event-footer"><span class="status-pill ${escapeHtml(ev.myResponse||'open')}">${escapeHtml(statusName[ev.myResponse||'open'])}</span>${trainer?`<strong>✓ ${c.yes} · ✕ ${c.no} · ? ${c.maybe}</strong>`:''}</div>
 ${trainer?`<div class="event-controls"><button class="link-button" data-action="participants" data-id="${ev.id}">Teilnehmerliste</button><button class="link-button" data-action="edit-event" data-id="${ev.id}">Bearbeiten</button><button class="link-button" data-action="delete-event" data-id="${ev.id}">Löschen</button></div>`:''}</article>`
}
function renderApp(){
 if(!state.mode){renderAuth();return}
 const trainer=isTrainer();const heading=state.panel==='settings'?'Gruppeneinstellungen':'Trainingsübersicht';
 const html=`<div class="dashboard">
 <aside class="dash-sidebar"><div class="dash-side-brand">TeamZeit<em>.</em></div><button class="dash-nav ${state.panel==='events'?'active':''}" data-action="panel-events">▦ &nbsp; Trainings</button>${trainer?`<button class="dash-nav ${state.panel==='settings'?'active':''}" data-action="panel-settings">⚙ &nbsp; Gruppe & Einladen</button>`:''}<div class="dash-tag">${state.mode==='demo'?'BEISPIELDATEN · DEMO':trainer?'TRAINER':'MITGLIED'}</div><div class="dash-spacer"></div><button class="btn btn-outline" data-action="${state.mode==='demo'?'end-demo':'logout'}">${state.mode==='demo'?'Demo beenden':'Abmelden'}</button></aside>
 <div class="dash-main"><div class="dash-top"><div><small>${escapeHtml(state.group?.name||'MEINE GRUPPE')}</small><h3>${heading}</h3></div>${state.panel==='events'&&trainer?'<button class="btn btn-primary" data-action="add-event">+ Termin anlegen</button>':''}</div>
 ${state.mode==='demo'?`<div class="demo-banner"><strong>Interaktive Demo.</strong> Alle Angaben sind Beispiele und werden nur in diesem Browser gespeichert. <div class="switches"><button data-action="demo-role" data-role="trainer" class="${trainer?'selected':''}">Als Trainer ansehen</button><button data-action="demo-role" data-role="member" class="${!trainer?'selected':''}">Als Mitglied ansehen</button><button data-action="reset-demo">Demo zurücksetzen</button></div></div>`:`<div class="group-tools"><label>Gruppe <select id="group-select">${state.groups.map(g=>`<option value="${escapeHtml(g.id)}" ${g.id===state.group?.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}</select></label><button class="link-button" data-action="new-group">Gruppe erstellen</button><button class="link-button" data-action="join-group">Einladung verwenden</button><button class="link-button" data-action="refresh">Aktualisieren</button><button class="link-button" data-action="account">Mein Konto</button></div>`}
 ${state.panel==='events'?`<div class="event-grid">${state.events.length?state.events.map(renderEvent).join(''):'<div class="empty-state"><strong>Noch keine Trainingstermine</strong>Ein Trainer kann den ersten Termin anlegen.</div>'}</div>`:renderSettings()}
 </div></div>`;
 root.innerHTML=html;
 document.getElementById('nav-auth').textContent=state.mode==='demo'?'Demo geöffnet':myName();
}
function renderSettings(){return renderEmailInviteSettings()+renderLegacySettings();}
function renderLegacySettings(){
 if(!isTrainer())return '<div class="inline-alert">Nur für Trainer sichtbar.</div>';
 return `<div class="settings-panel"><h4>Mitglieder einladen</h4><p>Teilen Sie den Einladungslink mit Freunden. Er gilt 7 Tage und kann von bis zu 25 Personen verwendet werden.</p><button class="btn btn-primary" data-action="invite">Einladung erstellen</button>${state.invite?`<div class="token-display">${escapeHtml(state.invite.inviteUrl||state.invite.inviteCode)}</div><button class="link-button" data-action="copy-invite">Link kopieren</button><p>Gültig bis ${escapeHtml(new Date(state.invite.expiresAt).toLocaleString('de-DE'))}</p>`:''}</div>
 <div class="settings-panel"><h4>Datenschutz und Zugriff</h4><p>Trainer sehen die Teilnehmerliste. Mitglieder sehen nur die eigene Antwort. Echte personenbezogene Daten erst nach Datenschutzprüfung verwenden.</p>${state.mode==='live'?'<button class="btn btn-secondary" data-action="show-members">Mitglieder verwalten</button><button class="link-button" data-action="delete-group">Gruppe löschen</button>':''}</div>`
}
function renderEmailInviteSettings(){
 if(!isTrainer())return '';
 const labels={pending:'Ausstehend',accepted:'Angenommen',expired:'Abgelaufen'},delivery={pending:'Versand läuft / unbestätigt',sent:'Versendet',failed:'Versand nicht bestätigt / fehlgeschlagen'};
 return `<div class="settings-panel"><h4>Persönlich per E-Mail einladen</h4><p>Jede Person erhält einen eigenen, einmaligen Link für ${escapeHtml(state.group?.name)}. Der Link gilt ausschließlich für die angegebene E-Mail-Adresse. Bestehende Konten können sich anmelden und die Einladung annehmen.</p>
 <form class="form-stack" id="email-invite-form"><label>E-Mail-Adressen<textarea name="emails" rows="4" maxlength="6000" placeholder="anna@example.de&#10;ben@example.de" required ${state.mode==='demo'?'disabled':''}></textarea></label><small>Bis zu 20 Adressen, getrennt durch Zeilenumbrüche, Kommas oder Semikolons. Nur erwünschte Einladungen versenden.</small><label>Gültigkeit<select name="expiresInDays" id="email-invite-days"><option value="7">7 Tage</option><option value="3">3 Tage</option><option value="1">1 Tag</option></select></label><p class="inline-alert" data-form-error hidden></p><button class="btn btn-primary" type="submit" ${state.mode==='demo'?'disabled':''}>Einladungen per E-Mail senden</button></form>
 ${state.mode==='demo'?'<p>In der Demo werden keine E-Mails versandt.</p>':''}<div id="email-invite-result" role="status"></div>
 <div class="invitation-heading"><h4>Einladungsübersicht</h4>${state.mode==='live'?'<button class="link-button" data-action="refresh-email-invites">Aktualisieren</button>':''}</div><p class="muted">„Versendet“ bedeutet: vom Versanddienst angenommen. Ein erneuter Versand erzeugt einen neuen Link und macht den bisherigen ungültig. Höchstens fünf Versuche je Adresse pro Tag, mindestens 60 Sekunden Abstand.</p>
 <ul class="email-invite-list">${state.emailInvitations.length?state.emailInvitations.map(item=>`<li class="email-invite-item"><div><strong>${escapeHtml(item.email)}</strong><p><span class="status-pill ${item.status==='accepted'?'yes':item.status==='expired'?'no':'maybe'}">${labels[item.status]}</span> <span>${escapeHtml(delivery[item.deliveryStatus]||'')}</span></p><small>Gültig bis ${escapeHtml(formatDate(item.expiresAt))}${item.acceptedAt?` · Angenommen am ${escapeHtml(formatDate(item.acceptedAt))}`:''}</small></div>${item.status!=='accepted'?`<button class="btn btn-secondary" data-action="resend-email-invite" data-id="${escapeHtml(item.id)}" ${!item.canResend?'disabled':''}>Erneut senden</button>`:''}</li>`).join(''):'<li>Noch keine persönlichen E-Mail-Einladungen.</li>'}</ul><small>Letzte 100 Einladungen. Historie bis 30 Tage nach Ablauf, anschließend tägliche Bereinigung.</small></div>`;
}
async function refreshEmailInvites(){
 state.emailInvitations=state.mode==='live'?(await call(`/groups/${state.group.id}/email-invites`)).invitations:[];
}
function emailInviteResult(results){
 const labels={sent:'Versendet',failed:'Versand nicht bestätigt – bitte später erneut senden',already_member:'Bereits Gruppenmitglied',cooldown:'Bitte mindestens 60 Sekunden warten',daily_limit:'Tageslimit für diese Adresse erreicht',changed:'Einladung wurde inzwischen geändert – bitte aktualisieren'};
 const node=document.getElementById('email-invite-result');if(node)node.innerHTML=`<ul>${results.map(item=>`<li>${escapeHtml(item.email)}: ${escapeHtml(labels[item.status]||item.status)}</li>`).join('')}</ul>`;
}
function showEventForm(id){
 if(!isTrainer())return notify('Nur Trainer können Termine anlegen.',true);
 const event=state.events.find(e=>e.id===id),edit=!!event;
 const next=event?.startAt||new Date(Date.now()+2*24*3600*1000).toISOString();
 openDialog(`<h3>${edit?'Termin bearbeiten':'Neuen Termin anlegen'}</h3><p>Die Traineransicht von TeamZeit (US01).</p>
 <form class="form-stack" id="event-form" data-event-id="${edit?event.id:''}">
 <label>Titel<input name="title" maxlength="100" required value="${escapeHtml(event?.title||'Vereinstraining')}"></label>
 <label>Datum & Uhrzeit (Europe/Berlin)<input name="startAt" type="datetime-local" required value="${escapeHtml(inputDate(next))}"></label>
 <label>Ort<input name="location" maxlength="120" required value="${escapeHtml(event?.location||'Sporthalle')}"></label>
 <label>Hinweise (optional)<textarea name="notes" maxlength="800">${escapeHtml(event?.notes||'')}</textarea></label>
 <p class="inline-alert" data-form-error hidden></p><button class="btn btn-primary" type="submit">${edit?'Änderungen speichern':'Training erstellen'}</button></form>`);
}
async function saveEvent(form){
 const data=Object.fromEntries(new FormData(form));
 const iso=berlinToUtc(data.startAt);const input={title:data.title,startAt:iso,location:data.location,notes:data.notes};
 if(state.mode==='demo'){
  if(form.dataset.eventId){const ev=state.events.find(e=>e.id===form.dataset.eventId);Object.assign(ev,input)}
  else state.events.push({...input,id:'demo-'+crypto.randomUUID(),groupId:'demo',myResponse:null,people:[{name:'Yousef',status:'open'},{name:'Vanessa',status:'open'},{name:'Suzana',status:'open'},{name:'Stefan',status:'open'},{name:'Ünal',status:'open'}]});
  saveDemo();
 }else if(form.dataset.eventId){await call(`/events/${form.dataset.eventId}`,'PATCH',input)}
 else await call(`/groups/${state.group.id}/events`,'POST',input);
 if(state.mode==='live')state.events=(await call(`/groups/${state.group.id}/events`)).events;
 closeDialog();renderApp();notify('Termin gespeichert.');
}
async function rsvp(id,status){
 if(state.mode==='demo'){
   const ev=state.events.find(e=>e.id===id);if(!ev)return;
   ev.myResponse=status;const row=ev.people.find(p=>p.name==='Yousef');if(row)row.status=status;
   saveDemo();
 }else {await call(`/events/${id}/rsvp`,'POST',{status});state.events=(await call(`/groups/${state.group.id}/events`)).events;}
 renderApp();notify(`Antwort gespeichert: ${statusName[status]}.`);
}
async function showParticipants(id){
 if(!isTrainer())return notify('Die Teilnehmerliste ist nur für Trainer sichtbar.',true);
 let people;
 if(state.mode==='demo'){const ev=state.events.find(e=>e.id===id);people=ev?.people||[]}
 else people=(await call(`/events/${id}/participants`)).participants;
 const title=state.events.find(e=>e.id===id)?.title||'Training';
 openDialog(`<h3>Teilnehmerliste</h3><p>${escapeHtml(title)} · Nur für Trainer</p><table class="participant-table"><thead><tr><th>Mitglied</th><th>Rückmeldung</th></tr></thead><tbody>${people.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td><span class="status-pill ${escapeHtml(p.status)}">${escapeHtml(statusName[p.status]||'Noch offen')}</span></td></tr>`).join('')}</tbody></table><p>${people.length} Gruppenmitglieder · Stand: ${escapeHtml(new Date().toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin'}))}</p><button class="btn btn-secondary" data-action="participants" data-id="${escapeHtml(id)}">Liste aktualisieren</button>`);
}
async function deleteEvent(id){
 if(!isTrainer())return;
 const event=state.events.find(e=>e.id===id);if(!event)return;
 if(!confirm(`Termin „${event.title}“ wirklich löschen?`))return;
 if(state.mode==='demo'){state.events=state.events.filter(e=>e.id!==id);saveDemo()}
 else {await call(`/events/${id}`,'DELETE');state.events=(await call(`/groups/${state.group.id}/events`)).events}
 renderApp();notify('Termin gelöscht.');
}
async function performAction(button){
 const action=button.dataset.action,id=button.dataset.id;
 if(action==='start-demo')return startDemo();
 if(action==='open-login')return showAuth('login');
 if(action==='auth-register')return showAuth('register');
 if(action==='auth-login')return showAuth('login');
 if(action==='auth-forgot')return showAuth('forgot');
 if(action==='auth-login-clear'){incomingInvite='';state.invitePreview=null;return showAuth('login');}
 if(action==='accept-invite'){
   const result=await call('/groups/join','POST',{inviteCode:incomingInvite});state.group={id:result.id};incomingInvite='';state.invitePreview=null;await loadLive();notify('Einladung angenommen. Willkommen in der Gruppe!');return;
 }
 if(action==='refresh-email-invites'){await refreshEmailInvites();renderApp();return;}
 if(action==='resend-email-invite'){
   button.disabled=true;
   try{const result=await call(`/groups/${state.group.id}/email-invites/${id}/resend`,'POST',{expiresInDays:Number(document.getElementById('email-invite-days')?.value||7)});state.emailInvitations=result.invitations;renderApp();emailInviteResult(result.results);}finally{button.disabled=false;}return;
 }
 if(action==='account'){
  openDialog('<h3>Mein Konto</h3><p>Sie können Ihre gespeicherten Konto- und Teilnahmedaten abrufen oder das Konto löschen.</p><button class="btn btn-secondary" data-action="export-account">Datenexport anzeigen</button><button class="link-button" data-action="delete-account">Konto endgültig löschen</button>');return;
 }
 if(action==='export-account'){
  const data=await call('/me/export');openDialog(`<h3>Meine Daten</h3><p>Diese JSON-Daten können Sie kopieren und speichern.</p><pre class="data-export">${escapeHtml(JSON.stringify(data,null,2))}</pre>`);return;
 }
 if(action==='delete-account'){
  if(!confirm('Konto mit Ihren Teilnahmeantworten endgültig löschen?'))return;
  await call('/me','DELETE',{});closeDialog();state.mode=null;state.user=null;state.group=null;await showAuth('login');notify('Konto gelöscht.');return;
 }
 if(action==='refresh')return loadLive();
 if(action==='new-group'){
   const name=prompt('Name der neuen Sportgruppe:');if(!name?.trim())return;
   const result=await call('/groups','POST',{name});state.group={id:result.id};return loadLive();
 }
 if(action==='join-group'){
   const inviteCode=prompt('Einladungscode oder vollständiger Einladungslink:',incomingInvite);if(!inviteCode)return;
   const code=inviteCode.includes('#invite=')?new URLSearchParams(inviteCode.split('#')[1]).get('invite'):inviteCode;
   const result=await call('/groups/join','POST',{inviteCode:code});state.group={id:result.id};return loadLive();
 }
 if(action==='delete-group'){
   if(!confirm('Gruppe mit allen Terminen und Antworten endgültig löschen?'))return;
   await call(`/groups/${state.group.id}`,'DELETE',{});return loadLive();
 }
 if(action==='member-role'||action==='member-remove'){
   if(!confirm(action==='member-remove'?'Mitglied aus der Gruppe entfernen?':'Rolle dieses Mitglieds ändern?'))return;
   await call(`/groups/${state.group.id}/members/${id}`,action==='member-remove'?'DELETE':'PATCH',action==='member-remove'?{}:{role:button.dataset.role});
   closeDialog();notify('Mitglied aktualisiert.');return;
 }
 if(action==='close-modal')return closeDialog();
 if(action==='end-demo'){state.mode=null;state.events=[];state.panel='login';renderAuth();return}
 if(action==='logout'){await call('/auth/logout','POST',{});state.mode=null;state.user=null;state.panel='login';renderAuth();notify('Abgemeldet.');return}
 if(action==='panel-events'){state.panel='events';renderApp();return}
 if(action==='panel-settings'){state.panel='settings';await refreshEmailInvites();renderApp();return}
 if(action==='demo-role'){state.demoRole=button.dataset.role;renderApp();return}
 if(action==='reset-demo'){state.events=defaultDemo();saveDemo();renderApp();notify('Demo zurückgesetzt.');return}
 if(action==='add-event')return showEventForm();
 if(action==='edit-event')return showEventForm(id);
 if(action==='delete-event')return deleteEvent(id);
 if(action==='participants')return showParticipants(id);
 if(action==='rsvp')return rsvp(id,button.dataset.status);
 if(action==='invite'){
  if(state.mode==='demo'){state.invite={inviteCode:'DEMO – nur Vorschau',expiresAt:new Date(Date.now()+7*86400000).toISOString()};notify('In der Demo werden keine echten Einladungen erstellt.')}
  else state.invite=await call(`/groups/${state.group.id}/invites`,'POST',{});
  renderApp();return;
 }
 if(action==='copy-invite'&&state.invite){await navigator.clipboard.writeText(state.invite.inviteUrl||state.invite.inviteCode);notify('Einladungslink kopiert.');return}
 if(action==='show-members'){
  const members=(await call(`/groups/${state.group.id}/members`)).members;
  openDialog(`<h3>Gruppenmitglieder</h3><table class="participant-table"><thead><tr><th>Name</th><th>Rolle</th><th>Verwalten</th></tr></thead><tbody>${members.map(m=>`<tr><td>${escapeHtml(m.name)}</td><td>${m.role==='trainer'?'Trainer':'Mitglied'}</td><td>${m.id!==state.user.id?`<button class="link-button" data-action="member-role" data-id="${m.id}" data-role="${m.role==='trainer'?'member':'trainer'}">${m.role==='trainer'?'Zum Mitglied':'Zum Trainer'}</button><button class="link-button" data-action="member-remove" data-id="${m.id}">Entfernen</button>`:'Eigenes Konto'}</td></tr>`).join('')}</tbody></table>`);return;
 }
}
document.addEventListener('click',async ev=>{
 const button=ev.target.closest('[data-action]');if(!button)return;
 ev.preventDefault();try{await performAction(button)}catch(err){notify(err.message||'Fehler',true)}
});
document.addEventListener('submit',async ev=>{
 const form=ev.target;if(!['auth-form','event-form','email-invite-form'].includes(form.id))return;
 ev.preventDefault();const btn=form.querySelector('[type=submit]');if(btn.disabled)return;btn.disabled=true;
 try{
  if(form.id==='event-form')return await saveEvent(form);
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='email-invite-form'){
    if(state.mode!=='live')throw Error('In der Demo werden keine E-Mails versandt.');
    const result=await call(`/groups/${state.group.id}/email-invites`,'POST',{emails:data.emails,expiresInDays:Number(data.expiresInDays)});state.emailInvitations=result.invitations;renderApp();emailInviteResult(result.results);return;
  }
  if(form.dataset.form==='forgot'){const result=await call('/auth/forgot-password','POST',data);notify(result.message);return;}
  if(form.dataset.form==='reset'){await call('/auth/reset-password','POST',{...data,token:resetToken});resetToken='';await showAuth('login');notify('Passwort geändert. Bitte neu anmelden.');return;}
  if(form.dataset.form==='login'){
    await call('/auth/login','POST',data);
    if(incomingInvite){const joined=await call('/groups/join','POST',{inviteCode:incomingInvite});state.group={id:joined.id};incomingInvite='';state.invitePreview=null;}
  }
  else if(form.dataset.form==='register')await call('/auth/register','POST',{...data,privacyAccepted:data.privacyAccepted==='on'});
  else if(form.dataset.form==='setup')await call('/setup','POST',data);
  if(form.dataset.form==='register'){incomingInvite='';state.invitePreview=null;}
  await loadLive();notify('Willkommen bei TeamZeit!');
 }catch(err){errorIn(form,err.message)}finally{btn.disabled=false}
});
(async()=>{
 if(resetToken){await showAuth('reset');return;}
 if(incomingInvite){await showAuth('register');return;}
 try{const me=await call('/me');if(me.user){state.mode='live';state.user=me.user;state.groups=me.groups;state.group=me.groups[0]||null;state.events=state.group?(await call(`/groups/${state.group.id}/events`)).events:[];renderApp()}}
 catch{/* Public landing stays available without backend session. */}
})();
document.addEventListener('change',async event=>{
 if(event.target.id!=='group-select')return;
 state.group=state.groups.find(g=>g.id===event.target.value);state.invite=null;
 state.emailInvitations=[];
 try{state.events=(await call(`/groups/${state.group.id}/events`)).events;if(state.panel==='settings')await refreshEmailInvites();renderApp();}catch(error){notify(error.message,true);}
});
window.addEventListener('hashchange',()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.has('invite')){incomingInvite=params.get('invite');history.replaceState(null,'',location.pathname+location.search);showAuth('register');}
 if(params.has('reset')){resetToken=params.get('reset');history.replaceState(null,'',location.pathname+location.search);showAuth('reset');}
});
let refreshing=false;
async function refreshVisibleEvents(){
 if(refreshing||document.hidden||state.mode!=='live'||state.panel!=='events'||!state.group||modal.open)return;
 refreshing=true;
 try{state.events=(await call(`/groups/${state.group.id}/events`)).events;renderApp();}catch{/* Manual refresh displays connection errors. */}finally{refreshing=false;}
}
setInterval(refreshVisibleEvents,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisibleEvents();});
