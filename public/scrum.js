const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={project_admin:'Projektadministrator',product_owner:'Product Owner',scrum_master:'Scrum Master',developer:'Developer',stakeholder:'Stakeholder'},columns={todo:'Offen',in_progress:'In Arbeit',review:'Review',done:'Erledigt'};
export function scrumBoard({root,call,notify,user,onBack}){
 let projects=[],selected=null,tasks=[],members=[],editing=null;
 const canManage=()=>['project_admin','product_owner','scrum_master'].includes(selected?.role);
 const memberOptions=id=>'<option value="">Nicht zugeordnet</option>'+members.map(m=>`<option value="${m.id}" ${m.id===id?'selected':''}>${escape(m.name)} · ${labels[m.role]}</option>`).join('');
 async function refresh(){
  projects=(await call('/scrum/projects')).projects;selected=projects.find(p=>p.id===selected?.id)||projects[0]||null;
  if(selected){[tasks,members]=await Promise.all([call(`/scrum/projects/${selected.id}/tasks`).then(x=>x.tasks),call(`/scrum/projects/${selected.id}/members`).then(x=>x.members)]);}else{tasks=[];members=[];}render();
 }
 function render(){
  root.innerHTML=`<div class="scrum-board"><div class="scrum-heading"><div><small>GESCHÜTZTE PROJEKTVERWALTUNG</small><h3>Scrum Board</h3></div><button class="btn btn-secondary" data-scrum="back">Zur Trainingsübersicht</button><button class="link-button" data-scrum="refresh">Aktualisieren</button></div>
  ${!selected?'<p>Du bist noch keinem Scrum-Projekt zugeordnet. Ein Projektadministrator kann dich nach deiner Registrierung per E-Mail-Adresse aufnehmen. Sportmitgliedschaften vergeben keine Scrum-Rechte.</p>':`<label>Projekt<select id="scrum-project">${projects.map(p=>`<option value="${p.id}" ${p.id===selected.id?'selected':''}>${escape(p.name)}</option>`).join('')}</select></label><p>Deine Projektrolle: <strong>${labels[selected.role]}</strong>. Sportrollen bleiben davon unabhängig.</p>
  ${canManage()?`<form data-scrum-form="task" class="form-stack scrum-form"><h4>${editing?'Aufgabe bearbeiten':'Aufgabe anlegen & zuweisen'}</h4><label>Titel<input name="title" maxlength="140" required value="${escape(editing?.title||'')}"></label><label>Beschreibung<textarea name="description" maxlength="2000">${escape(editing?.description||'')}</textarea></label><label>Zuständige Person<select name="assigneeId">${memberOptions(editing?.assigneeId)}</select></label><button class="btn btn-primary" type="submit">${editing?'Änderungen speichern':'Aufgabe anlegen'}</button>${editing?'<button type="button" class="link-button" data-scrum="cancel-edit">Abbrechen</button>':''}<p role="alert" data-scrum-error></p></form>`:''}
  <div class="scrum-columns">${Object.entries(columns).map(([status,label])=>`<section class="scrum-column"><h4>${label} (${tasks.filter(t=>t.status===status).length})</h4>${tasks.filter(t=>t.status===status).map(t=>`<article class="scrum-card"><h5>${escape(t.title)}</h5><p class="scrum-description">${escape(t.description)}</p><p><strong>${escape(members.find(m=>m.id===t.assigneeId)?.name||'Nicht zugeordnet')}</strong></p>${canManage()||(selected.role==='developer'&&t.assigneeId===user.id)?`<label>Status<select data-scrum-task="${t.id}">${Object.entries(columns).map(([value,name])=>`<option value="${value}" ${t.status===value?'selected':''}>${name}</option>`).join('')}</select></label>`:''}${canManage()?`<button class="link-button" data-scrum="edit" data-id="${t.id}">Bearbeiten / zuweisen</button><button class="link-button" data-scrum="delete-task" data-id="${t.id}">Löschen</button>`:''}</article>`).join('')||'<p>Keine Aufgaben.</p>'}</section>`).join('')}</div><small>Letzte 500 Aufgaben. Entwickler ändern den Status eigener zugewiesener Aufgaben; Stakeholder lesen mit.</small>
  ${selected.role==='project_admin'?`<section class="settings-panel"><h4>Projektmitglieder & Rollen</h4><form data-scrum-form="member" class="form-stack scrum-form"><label>E-Mail eines registrierten Benutzers<input name="email" type="email" required autocomplete="off"></label><label>Projektrolle<select name="role">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value==='developer'?'selected':''}>${label}</option>`).join('')}</select></label><button type="submit" class="btn btn-primary">Mitglied aufnehmen / Rolle speichern</button><p role="alert" data-scrum-error></p></form><ul class="scrum-members">${members.map(m=>`<li><span>${escape(m.name)} · ${labels[m.role]}</span><button class="link-button" data-scrum="remove-member" data-id="${m.id}">Projektzugriff entfernen</button></li>`).join('')}</ul><p>Rollen werden ausschließlich hier ausdrücklich vergeben. Die letzte Projektadministration kann nicht entfernt werden.</p></section>`:''}`}</div>`;
 }
 root.onclick=async e=>{const b=e.target.closest('[data-scrum]');if(!b)return;e.preventDefault();b.disabled=true;try{
  const action=b.dataset.scrum;if(action==='back'){root.onclick=null;root.onsubmit=null;root.onchange=null;onBack();return;}
  if(action==='edit'){editing=tasks.find(t=>t.id===b.dataset.id);render();return;}
  if(action==='cancel-edit'){editing=null;render();return;}
  if(action==='delete-task'&&confirm('Aufgabe endgültig löschen?'))await call(`/scrum/projects/${selected.id}/tasks/${b.dataset.id}`,'DELETE',{});
  if(action==='remove-member'&&confirm('Projektzugriff dieser Person entfernen?'))await call(`/scrum/projects/${selected.id}/members/${b.dataset.id}`,'DELETE',{});
  await refresh();
 }catch(error){notify(error.message,true);}finally{b.disabled=false;}};
 root.onsubmit=async e=>{const form=e.target;if(!form.dataset.scrumForm)return;e.preventDefault();e.stopPropagation();const b=form.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;try{
  const d=Object.fromEntries(new FormData(form));
  if(form.dataset.scrumForm==='member')await call(`/scrum/projects/${selected.id}/members`,'POST',d);
  else if(editing)await call(`/scrum/projects/${selected.id}/tasks/${editing.id}`,'PATCH',{...d,version:editing.version});
  else await call(`/scrum/projects/${selected.id}/tasks`,'POST',d);
  editing=null;await refresh();notify('Gespeichert.');
 }catch(error){form.querySelector('[data-scrum-error]').textContent=error.message;}finally{b.disabled=false;}};
 root.onchange=async e=>{try{
  if(e.target.id==='scrum-project'){selected=projects.find(p=>p.id===e.target.value);editing=null;await refresh();return;}
  const id=e.target.dataset.scrumTask;if(!id)return;const t=tasks.find(t=>t.id===id);e.target.disabled=true;
  await call(`/scrum/projects/${selected.id}/tasks/${id}`,'PATCH',{status:e.target.value,version:t.version});await refresh();
 }catch(error){notify(error.message,true);await refresh();}};
 return refresh().catch(error=>{root.innerHTML='<p>Scrum Board konnte nicht geladen werden.</p><button data-action="panel-events" class="btn btn-secondary">Zurück</button>';notify(error.message,true);});
}
