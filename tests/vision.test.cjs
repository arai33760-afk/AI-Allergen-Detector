const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve(__dirname,'..'),c={window:{}};vm.createContext(c);
for(const f of ['database.js','catalog.js','engine.js','vision.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),c,{filename:f});
const V=c.window.FoodVision,C=c.window.CLINICAL_CATALOG,E=c.window.AllergenEngine.create(C);
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const p=(className,probability=.8)=>({className,probability});
test('Bread and sandwich classes become useful editable suggestions',()=>{assert.equal(V.mapPredictions([p('French loaf')])[0].id,'bread');assert.equal(V.mapPredictions([p('sandwich')])[0].id,'sandwich');});
test('ImageNet alternate class names work',()=>{for(const [name,id] of [['hotdog, hot dog, red hot','hotdog'],['ice cream, icecream','icecream'],['Dungeness crab, Cancer magister','crab'],['coho, cohoe, coho salmon','salmon']])assert.equal(V.mapPredictions([p(name)])[0].id,id);});
test('Non-food or weak predictions never fabricate a dish',()=>{for(const value of [[p('laptop')],[p('pizza',.07)],[p('crabapple')],[p('pineapple',NaN)],[p('bread',1.5)],null,[null],[]])assert.equal(V.mapPredictions(value).length,0);});
test('Suggestions are ranked and deduplicated',()=>{const r=V.mapPredictions([p('pizza',.12),p('French loaf',.7),p('baguette',.5),p('bagel',.15),p('ice cream',.1)]);assert.equal(r.length,3);assert.equal(r[0].id,'bread');assert.equal(r[1].id,'bagel');});
test('Every visual food can be screened without an invented diagnosis',()=>{for(const entry of V.entries){const r=E.analyze(entry.label.en,{}, {mode:'menu',source:'vision'});assert(r.detections.length,entry.label.en);assert.equal(r.level,'review');assert(!r.detections.some(d=>d.kind==='direct'),entry.label.en);}});
test('Banh mi flags both egg and wheat as recipe possibilities for Richard',()=>{const r=E.analyze('Bánh mì',{name:'Richard',selections:{egg:{all:true,status:'reported'},wheat:{all:true,status:'reported'}}},{mode:'menu',source:'photoConfirmed'});for(const key of ['egg','wheat'])assert(r.detections.some(d=>d.group===key&&d.kind==='recipe'&&d.relation==='match'),key);assert.equal(r.level,'review');});
test('Previous Indian and Vietnamese dishes remain available',()=>{for(const name of ['Dosa','Butter chicken','Biryani','Phở','Bánh mì'])assert(E.analyze(name,{}, {mode:'menu'}).detections.some(d=>d.kind==='recipe'),name);});
test('MobileNet cleanup uses GraphModel without requiring a wrapper method',()=>{let disposed=0;V.dispose({model:{dispose(){disposed++;}}});assert.equal(disposed,1);V.dispose(null);V.dispose({});V.dispose({model:{dispose(){throw Error('already disposed');}}});});
console.log(JSON.stringify({visionChecks:count,dishes:C.dishes.length,modelAccuracyTested:false}));
