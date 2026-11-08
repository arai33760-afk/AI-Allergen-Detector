// DOM/event smoke tests; these do not replace visual or physical-phone testing.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(base,'index.html'),'utf8'),all=[];
class Element {
 constructor(attrs={}){this.attrs=attrs;this.dataset={};for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.value=attrs.value||'';this.hidden='hidden'in attrs;this.checked='checked'in attrs;this.disabled='disabled'in attrs;this.textContent='';this._html='';this.classList={toggle(){},add(){},remove(){}};}
 set innerHTML(value){this._html=value;for(let i=all.length-1;i>=0;i--)if(all[i].parent===this)all.splice(i,1);parse(value,this);}
 get innerHTML(){return this._html;}
 setAttribute(k,v){this.attrs[k]=v;}
 closest(s){return matches(this,s)?this:null;}
 click(){this.onclick?.({target:this});}
 showModal(){this.open=true;}
 close(){this.open=false;}
 append(){}
 remove(){}
}
function parse(text,parent){for(const m of text.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){const attrs={tag:m[1]};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';const el=new Element(attrs);el.parent=parent;all.push(el);}}
function matches(el,s){if(s[0]==='#')return el.attrs.id===s.slice(1);const m=s.match(/^\[([\w-]+)\]$/);return m?m[1]in el.attrs:false;}
parse(html);const $=s=>all.find(e=>matches(e,s));
$('#categoryFilter').value='all';$('#language').value='en';$('#ocrLanguage').value='eng';
const memory=new Map(),document={documentElement:{lang:'en'},body:new Element(),head:new Element(),querySelector:$,querySelectorAll:s=>all.filter(e=>matches(e,s)),createElement:()=>new Element()};
const c={document,navigator:{},location:{protocol:'file:'},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},console,URL,Blob,setTimeout,clearTimeout,confirm:()=>true,Date,Map,Set};
c.window=c;c.addEventListener=()=>{};c.print=()=>{};vm.createContext(c);
for(const f of ['database.js','catalog.js','engine.js','i18n.js','app.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),c,{filename:f});
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const change=(el,value)=>{el.value=value;el.onchange({target:el});},view=v=>all.find(e=>e.dataset.view===v).click();
test('Startup translates and binds controls',()=>{assert($('#analyzeBtn').textContent.includes('profile'));assert.equal(typeof $('#saveProfile').onclick,'function');assert($('#result').innerHTML.includes('Ready when you are'));});
test('Profile opens with 100 foods',()=>{view('profile');assert.equal($('#profileView').hidden,false);assert($('#catalogCount').textContent.includes('100'));});
test('Milk reveals casein and excludes airway proteins',()=>{const n=all.find(e=>e.dataset.all==='milk');n.checked=true;$('#catalog').onchange({target:n});assert.equal($('#body-milk').hidden,false);assert($('#catalog').innerHTML.includes('Bos d 8'));assert(!$('#catalog').innerHTML.includes('Bos d 2'));});
test('Save persists profile and reaction history',()=>{$('#profileName').oninput({target:{value:'Demo test'}});$('#reactionNotes').oninput({target:{value:'Synthetic test record'}});$('#saveProfile').click();const p=JSON.parse(memory.get('allergenguard_profile_v3'));assert.equal(p.name,'Demo test');assert.equal(p.notes,'Synthetic test record');assert.equal(p.selections.milk.all,true);});
test('Ingredient check renders personal warning and original text',()=>{$('#textInput').value='Ingredients: casein. May contain peanuts.';$('#analyzeBtn').click();assert($('#result').innerHTML.includes('Your selected allergen source was found'));assert($('#result').innerHTML.includes('Ingredients: casein.'));assert.equal(JSON.parse(memory.get('allergenguard_history_v3')).length,1);});
test('Vietnamese switch translates results and preserves profile',()=>{change($('#language'),'vi');assert.equal(document.documentElement.lang,'vi');assert($('#result').innerHTML.includes('Phát hiện nguồn dị nguyên'));assert($('#profileSummary').textContent.includes('Demo test'));});
test('Menu labels named milk as uncertain',()=>{$('#menuMode').click();$('#textInput').value='Trà sữa';$('#analyzeBtn').click();assert($('#result').innerHTML.includes('chưa xác nhận thành phần'));assert(!$('#result').innerHTML.includes('result-status alert'));});
test('History renders selected result with saved profile',()=>{view('history');assert($('#historyList').innerHTML.includes('Demo test'));const n=all.find(e=>e.dataset.history==='1');$('#historyList').onclick({target:n});assert($('#result').innerHTML.includes('Ingredients: casein.'));assert.equal($('#screenView').hidden,false);});
test('Blank input displays feedback',()=>{$('#textInput').value='';$('#analyzeBtn').click();assert($('#notice').textContent.includes('Hãy nhập'));});
test('Custom entries escape HTML',()=>{view('profile');$('#customName').value='<img src=x onerror=alert(1)>';$('#customAliases').value='testfood';$('#addCustom').click();assert(!$('#customList').innerHTML.includes('<img'));assert($('#customList').innerHTML.includes('&lt;img'));});
test('About opens with scientific references',()=>{$('#aboutBtn').click();assert.equal($('#aboutDialog').open,true);assert($('#sourcesList').innerHTML.includes('eaaci.org'));$('#closeAbout').click();assert.equal($('#aboutDialog').open,false);});
test('Offline assets exist with current versions',()=>{const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8'),a=sw.match(/const ASSETS=(\[[^;]+\])/)[1].replaceAll("'",'"');for(const asset of JSON.parse(a)){if(asset==='./')continue;assert(fs.existsSync(path.join(base,asset.split('?')[0])),asset);}assert(!html.includes('?v=9'));assert(!html.includes('?v=10"'));});
console.log(JSON.stringify({applicationChecks:count,visualBrowserTest:false}));
