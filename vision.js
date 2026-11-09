/* Map ImageNet food classes to editable dish suggestions, never confirmed ingredients. */
(function(root){
 'use strict';
 const entries=[
  ['pizza',['pizza'],'Pizza','Pizza'],
  ['burger',['cheeseburger','hamburger'],'Burger','Bánh burger'],
  ['hotdog',['hotdog','hot dog'],'Hot dog','Bánh mì xúc xích'],
  ['bread',['french loaf','baguette','bread'],'Bread / baguette','Bánh mì baguette'],
  ['sandwich',['sandwich'],'Sandwich','Bánh sandwich'],
  ['bagel',['bagel'],'Bagel','Bánh bagel'],
  ['pretzel',['pretzel'],'Pretzel','Bánh pretzel'],
  ['carbonara',['carbonara'],'Pasta carbonara','Mì Ý carbonara'],
  ['pasta',['spaghetti','pasta','noodle'],'Pasta','Mì Ý'],
  ['burrito',['burrito'],'Burrito','Bánh burrito'],
  ['potpie',['potpie','pot pie'],'Pot pie','Bánh nhân thịt'],
  ['meatloaf',['meat loaf','meatloaf'],'Meatloaf','Thịt nướng khuôn'],
  ['icecream',['ice cream','icecream'],'Ice cream','Kem'],
  ['eggnog',['eggnog'],'Eggnog','Đồ uống trứng sữa'],
  ['trifle',['trifle'],'Trifle','Bánh trifle'],
  ['waffle',['waffle'],'Waffle','Bánh waffle'],
  ['pancake',['pancake'],'Pancake','Bánh pancake'],
  ['crab',['dungeness crab','rock crab','king crab','crab'],'Crab','Cua'],
  ['lobster',['american lobster','spiny lobster','lobster'],'Lobster','Tôm hùm'],
  ['crayfish',['crayfish','crawfish'],'Crayfish','Tôm hùm đất'],
  ['salmon',['coho','salmon'],'Salmon','Cá hồi'],
  ['fish',['eel','sturgeon','barracouta','gar','sea bass'],'Fish','Cá'],
  ['snail',['conch','snail'],'Snail','Ốc'],
  ['guacamole',['guacamole'],'Guacamole','Bơ nghiền guacamole'],
  ['potato',['mashed potato'],'Mashed potato','Khoai tây nghiền'],
  ['soup',['consomme','hot pot','soup','broth'],'Soup / broth','Súp / nước dùng'],
  ['banana',['banana'],'Banana','Chuối'],
  ['strawberry',['strawberry'],'Strawberry','Dâu tây'],
  ['pineapple',['pineapple'],'Pineapple','Dứa'],
  ['apple',['granny smith'],'Apple','Táo'],
  ['jackfruit',['jackfruit'],'Jackfruit','Mít'],
  ['mushroom',['mushroom'],'Mushroom','Nấm']
 ].map(([id,words,en,vi])=>({id,words,label:{en,vi}}));
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function mapPredictions(predictions){
  const choices=[];
  for(const p of Array.isArray(predictions)?predictions:[]){
   if(!p||typeof p.className!=='string'||!Number.isFinite(p.probability)||p.probability<0.08||p.probability>1)continue;
   const name=p.className.toLowerCase();
   const e=entries.find(x=>x.words.some(w=>new RegExp('(^|[^a-z])'+esc(w)+'([^a-z]|$)').test(name)));
   if(!e)continue;
   const existing=choices.find(x=>x.id===e.id);
   if(existing){existing.score=Math.max(existing.score,p.probability);continue;}
   choices.push({id:e.id,label:e.label,text:e.label.en,score:p.probability});
  }
  return choices.sort((a,b)=>b.score-a.score).slice(0,3);
 }
 // MobileNet exposes its GraphModel as .model; it has no wrapper .dispose().
 function dispose(model){try{if(typeof model?.model?.dispose==='function')model.model.dispose();else if(typeof model?.dispose==='function')model.dispose();}catch{}}
 root.FoodVision={entries,mapPredictions,dispose,modelConfig:{version:2,alpha:1.0},topK:5};
})(typeof window!=='undefined'?window:globalThis);
