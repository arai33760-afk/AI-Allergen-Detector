/* Deterministic screening engine: evidence categories, never medical probabilities. */
(function(root){
 'use strict';
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[’‘]/g,"'");
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const boundary=s=>new RegExp('(?<![a-z0-9])'+esc(fold(s))+'(?![a-z0-9])','g');
 const accented=s=>/[\u0300-\u036fđĐ]/.test(s.normalize('NFD'));
 // Preserve label spelling while mapping accent-insensitive matches back to the input.
 function mapped(raw){let text='',offsets=[];for(let i=0;i<raw.length;){const ch=String.fromCodePoint(raw.codePointAt(i)),f=fold(ch);for(let j=0;j<f.length;j++)offsets.push(i);text+=f;i+=ch.length;}offsets.push(raw.length);return {text,offsets};}
 const negative=/\b(?:free from|free of|without|no(?!\s+(?:added|artificial|preservatives|colou?rs?|sugar|salt)\b)|khong chua|khong co|khong su dung)\b/g;
 const precaution=/\b(?:may contain|may be present|traces of|shared equipment|shared facility|processed in|manufactured in|co the chua|co the co|dung chung|san xuat tren|san xuat tai)\b/g;
 const declaration=/\b(?:contains|ingredients|chua|thanh phan)\b/g;
 function context(text,start,end){
  const left=text.slice(0,start).split(/[.;]/).pop();
  const right=text.slice(end);
  if(/^\s*[- ]free\b/.test(right))return 'claim';
  if(/\bnon[- ]$/.test(left))return 'ambiguous';
  let last={index:-1,kind:'direct',end:-1};
  for(const [re,kind] of [[negative,'claim'],[precaution,'precaution'],[declaration,'direct']]){
   re.lastIndex=0;let m;while((m=re.exec(left))){
    // "contains" / "chua" inside a negative or precaution phrase must not reset context.
    if(kind==='direct' && m.index<last.end)continue;
    if(m.index>=last.index)last={index:m.index,kind,end:m.index+m[0].length};
   }
  }
  return last.kind;
 }
 function create(catalog){
  const entries=[];
  for(const g of catalog.groups){
   for(const a of g.aliases)entries.push({g:g.key,m:null,a,re:boundary(a)});
   for(const m of g.members)for(const a of new Set(m.aliases))entries.push({g:g.key,m:m.id,a,re:boundary(a)});
  }
   // Plant drinks explicitly name their source; the substring "milk" does not mean dairy.
  const plantDrinks=[['soy','soybean','soy milk'],['soy','soybean','soya milk'],['soy','soybean','sữa đậu nành'],['soy','soybean','sữa đậu tương'],['coconut','coconut','coconut milk'],['coconut','coconut','sữa dừa'],['tree_nut','almond','almond milk'],['tree_nut','almond','sữa hạnh nhân'],['oat','oat','oat milk'],['oat','oat','sữa yến mạch'],['rice','rice','rice milk'],['rice','rice','sữa gạo']];
  for(const [g,m,a] of plantDrinks)entries.push({g,m,a,re:boundary(a)});
  for(const g of ['fish','shellfish','mollusc'])for(const a of ['seafood','hải sản'])entries.push({g,m:null,a,re:boundary(a),ambiguous:true});
  for(const g of ['shellfish','mollusc'])entries.push({g,m:null,a:'shellfish',re:boundary('shellfish'),ambiguous:true});
  const shields=['cà phê','ca phe','coffee','nước hoa','hương thơm'];
  function analyze(raw,profile={},options={}){
   const original=String(raw||'').slice(0,20000).normalize('NFC'), {text,offsets}=mapped(original);
   const wording=(start,end)=>original.slice(offsets[start],offsets[end]);
   const selections=profile.selections||{};const rawHits=[];
   for(const e of entries){e.re.lastIndex=0;let m;while((m=e.re.exec(text))){
    const seen=wording(m.index,m.index+m[0].length);
    if(accented(e.a)&&accented(seen)&&e.a.normalize('NFC').toLowerCase()!==seen.toLowerCase())continue;
    rawHits.push({...e,start:m.index,end:m.index+m[0].length});
   }}
   for(const a of shields){const re=boundary(a);let m;while((m=re.exec(text)))rawHits.push({g:null,a,start:m.index,end:m.index+m[0].length});}
   // Prefer longest source names: lobster / tôm hùm must not become shrimp / tôm.
   rawHits.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
   const accepted=[];
   for(const hit of rawHits){if(!accepted.some(h=>h.start<=hit.start&&h.end>=hit.end&&(h.end-h.start>hit.end-hit.start)))accepted.push(hit);}
   const detections=[],claims=[];
   const add=(g,m,kind,evidence)=>{
    let d=detections.find(x=>x.group===g&&x.member===m&&x.kind===kind);
    if(!d){d={group:g,member:m,kind,evidence:[],relation:'none'};detections.push(d);}
    if(!d.evidence.includes(evidence))d.evidence.push(evidence);
   };
   for(const hit of accepted){
    if(!hit.g)continue;
    let kind=context(text,hit.start,hit.end);
    // "egg-free", plant alternatives, and ambiguous Vietnamese single words need context.
    const evidence=wording(hit.start,hit.end);
    if(kind==='direct'&&(hit.ambiguous||['thom','vai','nhan'].includes(fold(hit.a))||(!accented(evidence)&&['ca','me','dua','de','oc','nam'].includes(fold(hit.a)))))kind='ambiguous';
    if(kind==='claim'){claims.push({group:hit.g,evidence});continue;}
    if(kind==='direct'&&options.mode==='menu')kind='menuNamed';
    add(hit.g,hit.m,kind,evidence);
   }
   // Recipe associations are always explicitly uncertain and used only in menu mode.
   const dishes=[];
   if(options.mode==='menu')for(const dish of catalog.dishes){
    if(dish.aliases.some(a=>boundary(a).test(text))){dishes.push(dish);for(const key of dish.keys)add(key,null,'recipe',dish.label.vi);}
   }
   for(const c of profile.custom||[]){
    for(const a of [c.name,...(c.aliases||[])].filter(a=>typeof a==='string'&&a.trim())){const re=boundary(a);let m;while((m=re.exec(text))){let k=context(text,m.index,m.index+m[0].length);if(k==='direct'&&options.mode==='menu')k='menuNamed';if(k!=='claim')add('custom:'+c.id,null,k,wording(m.index,m.index+m[0].length));}}
   }
   for(const d of detections){
    if(d.group.startsWith('custom:')){d.relation='match';continue;}
    const s=selections[d.group];if(!s)continue;
    if(s.all || (d.member&&(s.members||[]).includes(d.member)))d.relation='match';
    else if((s.members||[]).length||(s.components||[]).length)d.relation='review';
    // A named component is a text match, not a measurement of that protein in the food.
    const componentAliases=catalog.componentAliases||{};
    if((s.components||[]).some(c=>d.evidence.some(e=>[c,...(componentAliases[c]||[])].some(a=>fold(e)===fold(a)))))d.relation='match';
   }
   // Drop weaker recipe duplicates when a direct label/source finding is already present.
   const result=detections.filter(d=>d.kind!=='recipe'||!detections.some(x=>x.group===d.group&&['direct','menuNamed'].includes(x.kind)));
   result.sort((a,b)=>({match:0,review:1,none:2}[a.relation]-{match:0,review:1,none:2}[b.relation]));
   const contradictions=[...new Set(claims.filter(c=>result.some(d=>d.group===c.group&&d.kind!=='recipe')).map(c=>c.group))];
   const direct=result.some(d=>d.relation==='match'&&d.kind==='direct'&&selections[d.group]?.status!=='testOnly');
   const any=result.length>0;
   let level=direct?'alert':any||options.mode==='menu'||options.source==='ocr'?'review':'unresolved';
   if(!original.trim())level='empty';
   const conditionNotes=[];
   if(profile.conditions?.includes('lactose')&&result.some(d=>d.group==='milk'))conditionNotes.push('lactose');
   if(profile.conditions?.includes('coeliac')&&result.some(d=>['wheat','barley','rye','oat'].includes(d.group)))conditionNotes.push('coeliac');
   if(conditionNotes.length&&level==='unresolved')level='review';
   return {text:original,level,detections:result,claims,contradictions,dishes,conditionNotes,mode:options.mode||'label',source:options.source||'text',version:catalog.version};
  }
  return {analyze};
 }
 root.AllergenEngine={create,fold};
})(typeof window!=='undefined'?window:globalThis);
