(function(){
 'use strict';
 const C=window.CLINICAL_CATALOG,E=window.AllergenEngine.create(C),fold=window.AllergenEngine.fold;
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const KEYS={profile:'allergenguard_profile_v3',history:'allergenguard_history_v3',lang:'allergenguard_language'};
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
 let lang=read(KEYS.lang,'en');if(!['en','vi'].includes(lang))lang='en';
 const t=k=>(window.APP_TEXT[k]||[k,k])[lang==='vi'?1:0];
 const label=x=>x?.[lang]||x?.en||'';
 const group=k=>C.groups.find(g=>g.key===k);
 const emptyProfile=()=>({name:'',severe:false,notes:'',selections:{},custom:[],conditions:[]});
 function cleanProfile(p){
  const r=emptyProfile();if(!p||typeof p!=='object')return r;
  r.name=String(p.name||'').slice(0,60);r.severe=!!p.severe;
  r.notes=String(p.notes||'').slice(0,1000);
  for(const g of C.groups){const s=p.selections?.[g.key];if(!s)continue;
   const members=Array.isArray(s.members)?s.members.filter(x=>g.members.some(m=>m.id===x)):[];
   const components=Array.isArray(s.components)?s.components.filter(x=>g.members.some(m=>m.molecules.some(c=>c.id===x))):[];
   if(s.all||members.length||components.length)r.selections[g.key]={all:!!s.all,members,components,status:['reported','diagnosed','testOnly'].includes(s.status)?s.status:'reported'};
  }
  r.custom=(Array.isArray(p.custom)?p.custom:[]).slice(0,30).filter(c=>c&&String(c.name||'').length>=2).map((c,i)=>({id:'c'+i,name:String(c.name).slice(0,80),aliases:(Array.isArray(c.aliases)?c.aliases:[]).map(String).filter(a=>a.trim().length>1).slice(0,15).map(a=>a.slice(0,80))}));
  r.conditions=(Array.isArray(p.conditions)?p.conditions:[]).filter(x=>['lactose','coeliac'].includes(x));return r;
 }
 function notice(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
 function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{notice(t('storageError'));return false;}}
 let profile=cleanProfile(read(KEYS.profile,null)),draft=copy(profile),history=read(KEYS.history,[]);
 if(!Array.isArray(history))history=[];
 history=history.filter(h=>h&&typeof h.text==='string'&&!isNaN(Date.parse(h.time))).slice(0,50);
 let migrated=false;
 if(!read(KEYS.profile,null)){
  const old=read('allergen_profile_v2',[]);
  for(const token of Array.isArray(old)?old:[]){
   if(typeof token!=='string')continue;const [kind,key,...rest]=token.split(':');const g=group(key);if(!g)continue;
   const s=profile.selections[key]||{all:false,members:[],components:[],status:'reported'};
   if(kind==='group')s.all=true;
   if(kind==='mem'){const member=g.members.find(m=>m.label.en===rest.join(':'));if(member)s.members.push(member.id);}
   profile.selections[key]=s;migrated=true;
  }
  const person=read('allergen_person_v1',{});profile.name=String(person.name||'').slice(0,60);profile=cleanProfile(profile);draft=copy(profile);
 }
 let view='screen',mode='label',lastResult=null,lastResultProfile=profile,source='text',photo=null,previewUrl=null,busy=false;
 const expanded=new Set();
 function selectedCount(p){return Object.keys(p.selections).length+p.custom.length;}
 function setView(v){view=v;for(const name of ['screen','profile','history'])$('#'+name+'View').hidden=name!==v;$$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-current',b.dataset.view===v?'page':'false');});if(v==='profile'){fillProfile();renderCatalog();}if(v==='history')renderHistory();}
 function translate(){
  document.documentElement.lang=lang;$('#language').value=lang;
  $$('[data-i18n]').forEach(n=>n.textContent=t(n.dataset.i18n));$$('[data-placeholder]').forEach(n=>n.placeholder=t(n.dataset.placeholder));
  $('#sourcesList').innerHTML=Object.values(C.sources).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a></li>`).join('');
  renderSummary();renderResult(lastResult,lastResultProfile);renderHistory();if(view==='profile')renderCatalog();
  document.title='AllergenGuard · '+t('brandSub');
 }
 function renderSummary(){const names=Object.keys(profile.selections).map(k=>label(group(k).label)).concat(profile.custom.map(c=>c.name));$('#profileSummary').textContent=names.length?`${profile.name||t('anonymous')} · ${names.join(', ')}`:t('noProfile');}
 function fillProfile(){$('#profileName').value=draft.name;$('#reactionNotes').value=draft.notes;$('#severeHistory').checked=draft.severe;$('#conditionLactose').checked=draft.conditions.includes('lactose');$('#conditionCoeliac').checked=draft.conditions.includes('coeliac');renderCustom();}
 function selection(k){return draft.selections[k]||(draft.selections[k]={all:false,members:[],components:[],status:'reported'});}
 function prune(k){const s=draft.selections[k];if(s&&!s.all&&!s.members.length&&!s.components.length)delete draft.selections[k];}
 function memberComponents(g){return g.members.flatMap(m=>m.molecules.map(c=>({...c,food:label(m.label)}))).filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i);}
 function renderCatalog(){
  const q=fold($('#profileSearch').value.trim()),cat=$('#categoryFilter').value;
  const visible=C.groups.filter(g=>(cat==='all'||g.category===cat)&&(!q||fold(JSON.stringify(g)).includes(q)));
  $('#catalogCount').textContent=`${C.groups.length} ${t('groups')} · ${C.groups.reduce((n,g)=>n+g.members.length,0)} ${t('foods')}`;
  $('#selectionCount').textContent=`${selectedCount(draft)} ${t('selected')}`;
  $('#catalog').innerHTML=visible.map(g=>{
   const s=draft.selections[g.key],open=expanded.has(g.key)||!!q,components=memberComponents(g);
   return `<article class="food-group ${s?'selected':''}" data-group="${g.key}"><div class="group-head"><label><input type="checkbox" data-all="${g.key}" ${s?.all?'checked':''}>${esc(label(g.label))}</label><button type="button" data-expand="${g.key}" aria-expanded="${open}" aria-controls="body-${g.key}">${t(open?'hide':'details')}</button></div><div class="group-body" id="body-${g.key}" ${open?'':'hidden'}><p class="hint">${esc(label(g.note))}</p><div class="member-list">${g.members.map(m=>`<label class="check"><input type="checkbox" data-member="${g.key}" value="${m.id}" ${s?.members?.includes(m.id)||s?.all?'checked':''} ${s?.all?'disabled':''}>${esc(label(m.label))}</label>`).join('')}</div>
   <details class="component-options" ${g.key==='milk'?'open':''}><summary>${t('components')} (${components.length})</summary><p class="hint">${t('componentHelp')}</p>${components.length?components.map(c=>`<label class="component-option"><input type="checkbox" data-component="${g.key}" value="${esc(c.id)}" ${s?.components?.includes(c.id)?'checked':''}><span><b>${esc(c.id)}</b> · ${esc(label(c.label))}<small>${esc(c.food)}</small></span></label>`).join(''):`<p class="hint">${t('noComponents')}</p>`}</details>
   <label class="field-label" for="status-${g.key}">${t('status')}</label><select id="status-${g.key}" data-status="${g.key}">${['reported','diagnosed','testOnly'].map(k=>`<option value="${k}" ${s?.status===k?'selected':''}>${t(k)}</option>`).join('')}</select></div></article>`;
  }).join('')||`<p class="muted">${t('noSearch')}</p>`;
  $$('[data-all]').forEach(n=>{const s=draft.selections[n.dataset.all];n.indeterminate=!!s&&!s.all;});
 }
 function renderCustom(){$('#customList').innerHTML=draft.custom.map(c=>`<div class="custom-item"><span>${esc(c.name)}</span><button class="quiet" data-remove="${esc(c.id)}">${t('remove')}</button></div>`).join('');}
 function safeLink(url){try{const u=new URL(url);if(['https:','http:'].includes(u.protocol)&&/(^|\.)allergen\.org$/.test(u.hostname)){u.protocol='https:';return u.href;}}catch{}return C.sources.iuis.url;}
 function renderResult(r,p=profile){
  const box=$('#result');if(!r){box.innerHTML=`<div class="empty-result"><div class="empty-icon" aria-hidden="true">≡</div><h3>${t('emptyTitle')}</h3><p>${t('emptyText')}</p></div>`;return;}
  const level=r.level==='empty'?'unresolved':r.level;
  let html=`<div class="result-status ${level}"><h3>${t(level+'Title')}</h3><p>${t(level+'Text')}</p></div>`;
  if(p.severe)html+=`<p class="notice">${t('severeNote')}</p>`;
  if(r.contradictions.length)html+=`<p class="notice">${t('contradiction')}</p>`;
  if(r.mode==='menu')html+=`<p class="hint">${t('recipeNote')}</p>`;
  if(r.source==='ocr')html+=`<p class="hint">${t('ocrNote')}</p>`;
  if(!selectedCount(p))html+=`<p class="hint">${t('noProfile')}</p>`;
  html+=`<details class="checked-input"><summary>${t('checkedText')}</summary><p class="evidence">${esc(r.text)}</p></details>`;
  for(const c of r.conditionNotes)html+=`<p class="notice">${t(c+'Note')}</p>`;
  const sections=new Map();
  for(const d of r.detections){const key=d.group+'|'+d.kind+'|'+d.relation;if(!sections.has(key))sections.set(key,[]);sections.get(key).push(d);}
  for(const ds of sections.values()){
   const d=ds[0],g=group(d.group),custom=p.custom.find(c=>'custom:'+c.id===d.group);
   const members=ds.map(x=>g?.members.find(m=>m.id===x.member)).filter(Boolean);
   const title=g?label(g.label):custom?.name||d.group;
   const proteins=members.flatMap(m=>m.molecules).filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i);
   html+=`<article class="result-card"><div class="card-heading"><h3>${esc(title)}</h3><span class="badge ${d.relation==='match'?'personal':''}">${t(d.relation)}</span></div><span class="badge">${t(d.kind)}</span><p class="evidence">${t('evidence')}: <strong>${esc([...new Set(ds.flatMap(x=>x.evidence))].join(' · '))}</strong></p>`;
   if(p.selections[d.group])html+=`<p class="hint">${t('status')}: ${t(p.selections[d.group].status)}</p>`;
   if(g)html+=`<p class="hint">${esc(label(g.note))}</p>`;
   if(proteins.length)html+=`<details><summary>${t('molecularReference')}</summary><p class="hint">${t('proteinHint')}</p><ul class="component-list">${proteins.map(c=>`<li><a href="${esc(safeLink(c.link))}" target="_blank" rel="noopener noreferrer">${esc(c.id)}</a> · ${esc(label(c.label))}</li>`).join('')}</ul></details>`;
   else html+=`<p class="hint">${t('noComponents')}</p>`;
   html+=(g?.sources||[]).map(k=>`<a class="source-link" href="${esc(C.sources[k].url)}" target="_blank" rel="noopener noreferrer">${esc(C.sources[k].name)}</a>`).join('')+'</article>';
  }
  if(r.claims.length)html+=`<p class="hint">${t('claimNote')}</p>`;
  if(p.notes)html+=`<p class="hint">${t('reactionNotes')}: ${esc(p.notes)}</p>`;
  html+=`<p class="hint report-id">${esc(p.name||t('anonymous'))} · ${esc(r.checkedAt?new Date(r.checkedAt).toLocaleString(lang==='vi'?'vi-VN':'en-GB'):'')} · ${esc(C.version)}</p><button id="printCurrent" class="link">${t('print')}</button>`;box.innerHTML=html;
  $('#printCurrent').onclick=()=>window.print();
 }
 function setMode(m){mode=m;$('#labelMode').classList.toggle('selected',m==='label');$('#menuMode').classList.toggle('selected',m==='menu');$('#labelMode').setAttribute('aria-pressed',m==='label');$('#menuMode').setAttribute('aria-pressed',m==='menu');}
 function runAnalysis(){
  const text=$('#textInput').value.trim();if(!text){notice(t('emptyInput'));return;}
  if(source==='ocr'&&!$('#confirmOcr').checked){notice(t('confirmFirst'));return;}
  notice('');lastResult=E.analyze(text,profile,{mode,source});lastResult.checkedAt=new Date().toISOString();lastResultProfile=copy(profile);renderResult(lastResult,lastResultProfile);
  history.unshift({id:Date.now(),time:new Date().toISOString(),text,mode,source,profile:copy(profile),version:C.version});history=history.slice(0,50);write(KEYS.history,history);
 }
 function renderHistory(){$('#historyList').innerHTML=history.length?history.map((h,i)=>{const p=cleanProfile(h.profile);const r=E.analyze(h.text,p,{mode:h.mode,source:h.source});return `<div class="history-row"><div><strong>${esc(p.name||t('anonymous'))} · ${t(r.level+'Title')}</strong><p>${esc(new Date(h.time).toLocaleString(lang==='vi'?'vi-VN':'en-GB'))} · ${esc(h.text.slice(0,120))}</p></div><button class="secondary" data-history="${i}">${t('open')}</button></div>`;}).join(''):`<p class="muted">${t('noHistory')}</p>`;}
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function exportCsv(){const field=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Time','Profile','Input','Mode','Source','Group','Food','Evidence','Profile relation','Database version']];
  for(const h of history){const p=cleanProfile(h.profile),r=E.analyze(h.text,p,{mode:h.mode,source:h.source});for(const d of r.detections.length?r.detections:[{}])rows.push([h.time,p.name,h.text,h.mode,h.source,d.group||'',d.member||'',d.kind?t(d.kind):t('unresolvedTitle'),d.relation?t(d.relation):'',h.version||C.version]);}
  download('AllergenGuard_history.csv','\ufeff'+rows.map(r=>r.map(field).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 }
 function legacyData(){return {profile:read('allergen_profile_v2',[]),person:read('allergen_person_v1',{}),history:read('allergen_history_v1',[])};}
 const scripts=new Map();
 function loadScript(url,timeout=45000){if(scripts.has(url))return scripts.get(url);const promise=new Promise((resolve,reject)=>{const s=document.createElement('script');const timer=setTimeout(()=>{s.remove();scripts.delete(url);reject(Error('timeout'));},timeout);s.src=url;s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();scripts.delete(url);reject(Error('load'));};document.head.append(s);});scripts.set(url,promise);return promise;}
 async function resized(file){const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const ratio=Math.min(1,1800/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;}finally{URL.revokeObjectURL(url);}}
 let worker=null,workerLanguage='',ocrGeneration=0,idleTimer=null,activeTimer=null;
 function setBusy(b){busy=b;$('#ocrBtn').disabled=b||!photo;$('#visionBtn').disabled=b||!photo;$('#imageInput').disabled=b;$('#ocrLanguage').disabled=b;}
 async function releaseWorker(){clearTimeout(idleTimer);const w=worker;worker=null;workerLanguage='';if(w)try{await w.terminate();}catch{}}
 async function cancelOcr(){ocrGeneration++;clearTimeout(activeTimer);await releaseWorker();setBusy(false);$('#cancelOcr').hidden=true;$('#ocrStatus').textContent=t('cancelled');}
 async function runOcr(){if(!photo||busy)return;setBusy(true);$('#cancelOcr').hidden=false;const generation=++ocrGeneration;$('#ocrStatus').textContent=t('loading');clearTimeout(idleTimer);
  activeTimer=setTimeout(()=>{if(generation===ocrGeneration)cancelOcr();},120000);
  try{
   await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');if(generation!==ocrGeneration)return;
   const wanted=$('#ocrLanguage').value;if(worker&&workerLanguage!==wanted)await releaseWorker();
   if(!worker){const created=await Tesseract.createWorker(wanted,1,{logger:m=>{if(generation===ocrGeneration)$('#ocrStatus').textContent=t(m.status==='recognizing text'?'reading':'loading')+(m.status==='recognizing text'?' '+Math.round(m.progress*100)+'%':'');}});if(generation!==ocrGeneration){await created.terminate();return;}worker=created;workerLanguage=wanted;}
   const canvas=await resized(photo);if(generation!==ocrGeneration)return;const {data}=await worker.recognize(canvas);canvas.width=canvas.height=1;if(generation!==ocrGeneration)return;
   if(!data.text.trim()){$('#ocrStatus').textContent=t('noText');return;}
   $('#textInput').value=data.text.trim().slice(0,20000);source='ocr';setMode('label');$('#confirmOcr').checked=false;$('#ocrReview').hidden=false;$('#ocrStatus').textContent=t('ocrReady');updateCount();
  }catch{if(generation===ocrGeneration){$('#ocrStatus').textContent=t('ocrFailed');await releaseWorker();}}
  finally{if(generation===ocrGeneration){clearTimeout(activeTimer);setBusy(false);$('#cancelOcr').hidden=true;idleTimer=setTimeout(releaseWorker,60000);}}
 }
 async function runVision(){if(!photo||busy)return;setBusy(true);$('#visionStatus').textContent=t('loading');let model,timer,expired=false;
  try{await releaseWorker();await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js');
   const loading=mobilenet.load({version:2,alpha:0.5}).then(m=>{if(expired){m.dispose();throw Error('timeout');}return m;});
   model=await Promise.race([loading,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('timeout'));},45000);})]);clearTimeout(timer);
   const canvas=await resized(photo);const predictions=await model.classify(canvas,1);canvas.width=canvas.height=1;
   $('#visionStatus').textContent=t('visionConfirm')+(predictions[0]?.className||'?');setMode('menu');source='text';$('#ocrReview').hidden=true;
  }catch{$('#visionStatus').textContent=t('visionFailed');}finally{clearTimeout(timer);model?.dispose();setBusy(false);}
 }
 function updateCount(){$('#charCount').textContent=`${$('#textInput').value.length.toLocaleString()} / 20,000`;}
 $$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#editProfile').onclick=()=>setView('profile');
 $('#language').onchange=e=>{lang=e.target.value;write(KEYS.lang,lang);translate();if(view==='profile')renderCustom();};
 $('#aboutBtn').onclick=()=>$('#aboutDialog').showModal();$('#closeAbout').onclick=()=>$('#aboutDialog').close();
 $('#profileName').oninput=e=>draft.name=e.target.value;$('#severeHistory').onchange=e=>draft.severe=e.target.checked;
 $('#reactionNotes').oninput=e=>draft.notes=e.target.value;
 for(const [id,key] of [['conditionLactose','lactose'],['conditionCoeliac','coeliac']])$('#'+id).onchange=e=>{draft.conditions=draft.conditions.filter(k=>k!==key);if(e.target.checked)draft.conditions.push(key);};
 $('#profileSearch').oninput=renderCatalog;$('#categoryFilter').onchange=renderCatalog;
 $('#catalog').onclick=e=>{const b=e.target.closest('[data-expand]');if(b){const k=b.dataset.expand;expanded.has(k)?expanded.delete(k):expanded.add(k);renderCatalog();}};
 $('#catalog').onchange=e=>{const n=e.target;const key=n.dataset.all||n.dataset.member||n.dataset.component||n.dataset.status;if(!key)return;const s=selection(key);
  if(n.dataset.all){s.all=n.checked;expanded.add(key);}if(n.dataset.member){s.members=s.members.filter(x=>x!==n.value);if(n.checked)s.members.push(n.value);}if(n.dataset.component){s.components=s.components.filter(x=>x!==n.value);if(n.checked)s.components.push(n.value);}if(n.dataset.status)s.status=n.value;prune(key);renderCatalog();
 };
 $('#addCustom').onclick=()=>{const name=$('#customName').value.trim();if(name.length<2){notice(t('badCustom'));return;}if(draft.custom.some(c=>fold(c.name)===fold(name))){notice(t('duplicate'));return;}if(draft.custom.length>=30)return;draft.custom.push({id:'c'+Date.now(),name,aliases:$('#customAliases').value.split(',').map(x=>x.trim()).filter(x=>x.length>1)});$('#customName').value='';$('#customAliases').value='';renderCustom();renderCatalog();notice('');};
 $('#customList').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){draft.custom=draft.custom.filter(c=>c.id!==b.dataset.remove);renderCustom();renderCatalog();}};
 $('#saveProfile').onclick=()=>{profile=cleanProfile(draft);draft=copy(profile);const ok=write(KEYS.profile,profile);renderSummary();lastResult=null;renderResult(null);setView('screen');if(ok)notice(t('saved'));};
 $('#labelMode').onclick=()=>setMode('label');$('#menuMode').onclick=()=>setMode('menu');
 $('#exampleBtn').onclick=()=>{$('#textInput').value=mode==='menu'?'Gỏi cuốn':lang==='vi'?'Thành phần: bột sữa, đường, casein. Có thể chứa đậu phộng và mè.':'Ingredients: milk powder, sugar, casein. May contain peanuts and sesame.';source='text';$('#ocrReview').hidden=true;updateCount();};
 $('#textInput').oninput=()=>{if(source==='ocr')$('#confirmOcr').checked=false;updateCount();};$('#analyzeBtn').onclick=runAnalysis;
 $('#imageInput').onchange=e=>{const f=e.target.files[0];if(previewUrl)URL.revokeObjectURL(previewUrl);photo=null;$('#preview').hidden=true;
  if(!f){setBusy(false);return;}if(f.size>15*1024*1024||!/^image\/(jpeg|png|webp|bmp)$/.test(f.type)){notice(t('fileError'));e.target.value='';setBusy(false);return;}
  photo=f;previewUrl=URL.createObjectURL(f);$('#preview').src=previewUrl;$('#preview').hidden=false;$('#preview').alt=t('choosePhoto');setBusy(false);notice('');
 };
 $('#ocrBtn').onclick=runOcr;$('#cancelOcr').onclick=cancelOcr;$('#visionBtn').onclick=runVision;
 $('#historyList').onclick=e=>{const b=e.target.closest('[data-history]');if(!b)return;const h=history[Number(b.dataset.history)];lastResultProfile=cleanProfile(h.profile);lastResult=E.analyze(h.text,lastResultProfile,{mode:h.mode,source:h.source});lastResult.checkedAt=h.time;$('#textInput').value=h.text;source=h.source;setMode(h.mode);$('#ocrReview').hidden=source!=='ocr';$('#confirmOcr').checked=false;updateCount();setView('screen');renderResult(lastResult,lastResultProfile);notice((lastResultProfile.name||t('anonymous'))+' · '+new Date(h.time).toLocaleString(lang==='vi'?'vi-VN':'en-GB'));};
 $('#exportCsv').onclick=exportCsv;$('#printReport').onclick=()=>window.print();$('#clearHistory').onclick=()=>{if(confirm(t('clearConfirm'))){history=[];write(KEYS.history,history);renderHistory();}};
 $('#backupData').onclick=()=>download('AllergenGuard_backup.json',JSON.stringify({app:'AllergenGuard',schema:3,created:new Date().toISOString(),profile,history,legacy:legacyData()},null,2),'application/json');
 $('#restoreData').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024)throw Error();const data=JSON.parse(await f.text());if(data.app!=='AllergenGuard'||data.schema!==3||!data.profile||!Array.isArray(data.history))throw Error();if(!confirm(t('restoreConfirm')))return;profile=cleanProfile(data.profile);draft=copy(profile);history=data.history.filter(h=>h&&typeof h.text==='string'&&h.text.length<=20000&&['label','menu'].includes(h.mode)&&!isNaN(Date.parse(h.time))).slice(0,50).map(h=>({...h,profile:cleanProfile(h.profile)}));const a=write(KEYS.profile,profile),b=write(KEYS.history,history);translate();if(a&&b)notice(t('restored'));}catch{notice(t('badBackup'));}finally{e.target.value='';}};
 $('#textSize').onclick=()=>document.body.classList.toggle('big');
 window.addEventListener('pagehide',()=>{releaseWorker();if(previewUrl)URL.revokeObjectURL(previewUrl);});
 translate();if(migrated)notice(t('legacy'));
 if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
