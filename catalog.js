/* Curated bilingual food vocabulary. No diagnostic or prevalence claims.
   Original molecular records are retained only as source-linked reference data. */
(function(root){
 'use strict';
 const old=root.ALLERGEN_DB;
 const pair=(en,vi)=>({en,vi});
 const sources={
  iuis:{name:'WHO/IUIS Allergen Nomenclature',url:'https://www.allergen.org/'},
  milk:{name:'WHO/IUIS: milk caseins and components',url:'https://www.allergen.org/viewallergen.php?aid=166'},
  diagnosis:{name:'EAACI: food allergy diagnosis (2023)',url:'https://eaaci.org/guidelines-position-papers/eaaci-guidelines-on-the-diagnosis-of-ige-mediated-food-allergy/'},
  vietnam:{name:'Vietnam adult food-allergy survey (2020)',url:'https://www.worldallergyorganizationjournal.org/article/S1939-4551(20)30005-3/fulltext'},
  fda:{name:'FDA: food allergens and label statements',url:'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies'},
  farpp:{name:'AllergenOnline / FARRP',url:'https://www.allergenonline.org/'}
 };
 const groups=[];
 // Each item: English | Vietnamese | additional label aliases. Foods are selectable individually.
 function group(key,en,vi,category,rows,aliases=[],note){
  const original=old?.groups.find(g=>g.key===key);
  const members=rows.map(row=>{
   const [name,vn,extra='',oldName=name]=row.split('|');
   const om=original?.members.find(m=>m.name===oldName);
   return {id:name.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label:pair(name,vn),aliases:[name,vn,...extra.split(';')].filter(Boolean),
    molecules:(om?.molecules||[]).filter(m=>!/(renamed|not available|not recorded)/i.test(m.protein)).map(m=>({id:m.name,label:pair(m.protein,m.protein),link:m.link}))};
  });
  const g={key,label:pair(en,vi),category,aliases,members,note:note||pair('Select only foods relevant to your own allergy history. Group membership does not establish cross-allergy.','Chỉ chọn thực phẩm liên quan đến tiền sử dị ứng của bạn. Cùng nhóm không có nghĩa là chắc chắn dị ứng chéo.'),sources:original?['iuis','fda']:['fda']};
  groups.push(g); return g;
 }
 group('milk','Milk & dairy','Sữa và sản phẩm từ sữa','animal',[
  "Cow's milk|Sữa bò|milk;dairy;casein;caseinate;whey;cheese;butter;ghee;yogurt;yoghurt;cream;milk powder;condensed milk;sữa;bột sữa;sữa đặc;phô mai;pho mát;váng sữa;bơ sữa;sữa chua;đạm sữa;đạm whey",
  "Goat's milk|Sữa dê|goat milk", "Sheep's milk|Sữa cừu|sheep milk", "Buffalo milk|Sữa trâu|buffalo milk"
 ],['dairy products'],pair('Lactose is a sugar, not a milk protein. Lactose-free dairy can still contain milk allergens. Component selections do not establish tolerance to other milk proteins.','Lactose là đường, không phải protein sữa. Sữa không lactose vẫn có thể chứa protein gây dị ứng. Chọn một thành phần không chứng minh dung nạp các protein sữa khác.'));
 const milk=groups[0];
 const milkProteins=[['Bos d 8','Casein (family)','Casein (nhóm)',166],['Bos d 9','αS1-casein','αS1-casein',756],['Bos d 10','αS2-casein','αS2-casein',757],['Bos d 11','β-casein','β-casein',758],['Bos d 12','κ-casein','κ-casein',759],['Bos d 4','α-lactalbumin (whey)','α-lactalbumin (đạm whey)',162],['Bos d 5','β-lactoglobulin (whey)','β-lactoglobulin (đạm whey)',163],['Bos d 6','Bovine serum albumin','Albumin huyết thanh bò',164],['Bos d 7','Immunoglobulin','Immunoglobulin',165]];
 milk.members[0].molecules=milkProteins.map(([id,en,vi,aid])=>({id,label:pair(en,vi),link:id==='Bos d 8'?'https://www.allergen.org/viewallergen.php?aid=166':'https://www.allergen.org/search.php?allergenname='+encodeURIComponent(id)}));
 milk.sources=['milk','iuis','fda'];
 group('egg','Egg','Trứng','animal',["Hen's egg|Trứng gà|egg;eggs;trứng;lòng trắng trứng;lòng đỏ trứng;ovalbumin;ovomucoid;ovotransferrin;lysozyme|Hen's egg",'Duck egg|Trứng vịt|duck eggs;hột vịt;hột vịt lộn;trứng vịt lộn','Quail egg|Trứng cút|quail eggs']);
 group('shellfish','Crustaceans','Giáp xác','seafood',['Shrimp / Prawn|Tôm|shrimp;prawn;prawns;shrimps;tép;tôm sú;tôm thẻ;tôm khô;mắm tôm;mắm ruốc;ruốc tôm;shrimp paste;prawn paste|Shrimp / Prawn','Crab|Cua / ghẹ|crab;crabs;cua;ghẹ;cua đồng;mắm cua','Lobster|Tôm hùm|lobster;lobsters','Crayfish|Tôm hùm đất|crayfish;crawfish'],['crustacean','crustaceans','giáp xác']);
 group('mollusc','Molluscs','Nhuyễn thể','seafood',['Squid|Mực|squid;calamari;mực ống;mực nang','Octopus|Bạch tuộc|octopus','Oyster|Hàu|oyster;oysters;dầu hào;oyster sauce','Mussel|Vẹm|mussel;mussels','Clam|Nghêu / ngao|clam;clams;nghêu;ngao;hến','Cockle|Sò huyết / sò lông|cockle;cockles;sò huyết;sò lông','Scallop|Sò điệp|scallop;scallops','Snail|Ốc|snail;snails;ốc','Abalone|Bào ngư|abalone'],['mollusc','mollusk','molluscs','mollusks','nhuyễn thể']);
 group('fish','Fish','Cá','seafood',['Atlantic salmon|Cá hồi|salmon|Atlantic salmon','Tuna|Cá ngừ|tuna','Carp|Cá chép|carp','Atlantic cod|Cá tuyết|cod|Atlantic cod','Mackerel|Cá thu|mackerel','Anchovy|Cá cơm|anchovy;anchovies','Pangasius|Cá tra / cá basa|pangasius;basa;cá tra;cá basa','Tilapia|Cá rô phi|tilapia','Snakehead|Cá lóc / cá quả|snakehead;cá lóc;cá quả','Sardine|Cá mòi|sardine;sardines','Eel|Lươn|eel;eels','Rainbow trout|Cá hồi vân|trout|Rainbow trout'],['fish','cá','fish sauce','nước mắm','mắm cá','fish protein'],pair('Fish sauce is a fish-source flag. An unspecified fish ingredient needs review if you selected a particular fish. Species-specific reactions cannot be inferred from a group name.','Nước mắm được đánh dấu nguồn cá. Nếu chỉ chọn một loài cá, thành phần cá không rõ loài vẫn cần kiểm tra. Không suy ra phản ứng theo loài chỉ từ tên nhóm.'));
 group('peanut','Peanut','Đậu phộng / lạc','plant',['Peanut|Đậu phộng / lạc|peanut;peanuts;groundnut;groundnuts;đậu phộng;lạc;bơ đậu phộng;dầu lạc;peanut oil;arachis']);
 group('tree_nut','Tree nuts','Các loại hạt cây','plant',['Cashew|Hạt điều|cashew;cashews','Almond|Hạnh nhân|almond;almonds;marzipan','Walnut|Óc chó|walnut;walnuts','Pistachio|Hạt dẻ cười|pistachio;pistachios','Hazelnut|Hạt phỉ|hazelnut;hazelnuts','Macadamia|Mắc ca|macadamia;macca','Pecan|Hồ đào|pecan;pecans','Brazil nut|Hạt Brazil|brazil nuts','Chestnut|Hạt dẻ|chestnut;chestnuts'],['tree nut','tree nuts','hạt cây']);
 group('soy','Soy','Đậu nành / đậu tương','plant',['Soybean|Đậu nành / đậu tương|soy;soya;soybean;soybeans;tofu;đậu nành;đậu tương;đậu hũ;đậu phụ;tàu hũ;tương đậu nành;nước tương;xì dầu;soy sauce;soy lecithin;lecithin đậu nành']);
 group('sesame','Sesame','Mè / vừng','plant',['Sesame|Mè / vừng|sesame;tahini;mè;vừng;dầu mè;sesame oil']);
 group('wheat','Wheat','Lúa mì','plant',['Bread wheat|Lúa mì|wheat;wheat flour;semolina;durum;spelt;bulgur;couscous;seitan;wheat gluten;lúa mì;bột mì;mì căn|Bread wheat']);
 group('buckwheat','Buckwheat','Kiều mạch','plant',['Buckwheat|Kiều mạch|buckwheat;kiều mạch']);
 group('mustard','Mustard','Mù tạt','plant',['Yellow mustard|Mù tạt|mustard;dijon;mù tạt|Yellow mustard']);
 group('celery','Celery','Cần tây','plant',['Celery|Cần tây|celery;celeriac;cần tây']);
 group('lupin','Lupin','Đậu lupin','plant',['White lupin|Đậu lupin|lupin;lupine;lupin flour;đậu lupin|White lupin']);
 group('legumes','Other legumes','Các đậu khác','plant',['Mung bean|Đậu xanh|mung bean;mung beans;green gram','Black bean|Đậu đen|black bean;black beans','Red bean|Đậu đỏ|red bean;red beans;adzuki','Chickpea|Đậu gà|chickpea;chickpeas;gram flour;besan','Pea|Đậu Hà Lan|pea;peas;pea protein','Lentil|Đậu lăng|lentil;lentils']);
 group('seeds','Other seeds','Các hạt khác','plant',['Sunflower seed|Hạt hướng dương|sunflower seed;sunflower seeds','Pumpkin seed|Hạt bí|pumpkin seed;pumpkin seeds','Lotus seed|Hạt sen|lotus seed;lotus seeds','Chia seed|Hạt chia|chia;chia seed','Flaxseed|Hạt lanh|flaxseed;linseed']);
 group('coconut','Coconut','Dừa','plant',['Coconut|Dừa|coconut;coconut milk;coconut cream;dừa;nước cốt dừa;sữa dừa']),
 group('rice','Rice','Gạo','plant',['Rice|Gạo / nếp|rice;rice flour;glutinous rice;gạo;bột gạo;gạo nếp;bột nếp']);
 group('corn','Corn / maize','Ngô / bắp','plant',['Corn|Ngô / bắp|corn;maize;cornmeal;corn flour;ngô;bắp;bột bắp']);
 group('oat','Oat','Yến mạch','plant',['Oat|Yến mạch|oat;oats;oatmeal;yến mạch']);
 group('barley','Barley','Đại mạch','plant',['Barley|Đại mạch|barley;barley malt;đại mạch']);
 group('rye','Rye','Lúa mạch đen','plant',['Rye|Lúa mạch đen|rye;lúa mạch đen']);
 group('kiwi','Kiwi','Kiwi','fruit',['Kiwi|Kiwi|kiwi;kiwifruit|Kiwifruit']);
 group('fruits','Other fruits','Trái cây khác','fruit',['Banana|Chuối|banana;bananas','Mango|Xoài|mango;mangoes','Avocado|Bơ (trái cây)|avocado;avocados;quả bơ;trái bơ','Papaya|Đu đủ|papaya','Jackfruit|Mít|jackfruit','Pineapple|Dứa / thơm / khóm|pineapple;dứa;thơm;khóm','Lychee|Vải|lychee;lychees;quả vải;trái vải','Longan|Nhãn|longan;quả nhãn;trái nhãn','Peach|Đào|peach;peaches;quả đào;trái đào','Apple|Táo|apple;apples','Strawberry|Dâu tây|strawberry;strawberries','Dragon fruit|Thanh long|dragon fruit','Durian|Sầu riêng|durian']);
 group('vegetables','Other vegetables','Rau củ khác','plant',['Tomato|Cà chua|tomato;tomatoes','Carrot|Cà rốt|carrot;carrots','Potato|Khoai tây|potato;potatoes','Sweet potato|Khoai lang|sweet potato;sweet potatoes','Mushroom|Nấm|mushroom;mushrooms;nấm','Garlic|Tỏi|garlic','Onion|Hành tây|onion;onions']);
 group('beef','Beef','Thịt bò','animal',['Beef|Thịt bò|beef;thịt bò;bò viên']);
 group('pork','Pork','Thịt heo / lợn','animal',['Pork|Thịt heo / lợn|pork;thịt heo;thịt lợn;giò heo']);
 group('poultry','Poultry','Thịt gia cầm','animal',['Chicken|Thịt gà|chicken;thịt gà','Duck|Thịt vịt|duck;thịt vịt','Quail|Chim cút|quail;chim cút']);
 group('other_meat','Other meats','Các thịt khác','animal',['Goat meat|Thịt dê|goat meat;thịt dê','Lamb|Thịt cừu|lamb;mutton;thịt cừu','Frog|Thịt ếch|frog;thịt ếch']);
 group('insect','Edible insects','Côn trùng ăn được','animal',['Silkworm pupa|Nhộng tằm|silkworm;silkworm pupa;nhộng tằm','Cricket|Dế|cricket;crickets;dế']);
 group('gelatin','Gelatin','Gelatin','animal',['Gelatin|Gelatin|gelatin;gelatine']);
 group('sulfite','Sulfites (sensitivity)','Sulfit (nhạy cảm)','other',['Sulfites|Sulfit|sulfite;sulphite;sulfites;sulphites;sulfur dioxide;sulphur dioxide;sulfit;e220;e221;e222;e223;e224;e226;e227;e228'],[],pair('Record sulfite sensitivity separately from food-protein allergy. The label does not establish the dose.','Ghi nhận nhạy cảm sulfit riêng với dị ứng protein thực phẩm. Nhãn không xác định được liều tiếp xúc.'));
 // Egg food components; Gal d 7 is a meat-associated myosin, not an egg protein.
 const egg=groups.find(g=>g.key==='egg').members[0];
 egg.molecules=egg.molecules.filter(m=>/^Gal d [1-6]$/.test(m.id));
 const componentAliases={
  'Bos d 8':['casein','caseinate','caseinates','sodium caseinate','calcium caseinate','potassium caseinate'],
  'Bos d 9':['alpha-s1-casein','alphaS1-casein','αS1-casein'],
  'Bos d 10':['alpha-s2-casein','alphaS2-casein','αS2-casein'],
  'Bos d 11':['beta-casein','β-casein'], 'Bos d 12':['kappa-casein','κ-casein'],
  'Bos d 4':['alpha-lactalbumin','α-lactalbumin'],'Bos d 5':['beta-lactoglobulin','β-lactoglobulin'],
  'Bos d 6':['bovine serum albumin'], 'Gal d 1':['ovomucoid'],'Gal d 2':['ovalbumin'],'Gal d 3':['ovotransferrin'],'Gal d 4':['egg lysozyme']
 };
 // Full source phrases prevent "milk" or "oyster" inside alternatives becoming animal-food evidence.
 const addAliases=(key,id,names)=>groups.find(g=>g.key===key).members.find(m=>m.id===id).aliases.push(...names);
 addAliases('vegetables','mushroom',['oyster mushroom','oyster mushrooms','nấm bào ngư','nấm sò']);
 addAliases('tree_nut','cashew',['cashew milk','sữa hạt điều','cashew butter']);
 addAliases('tree_nut','almond',['almond butter','almond cream']);
 addAliases('soy','soybean',['soy cream','soya cream']);
 addAliases('coconut','coconut',['coconut butter']);
 addAliases('fruits','papaya',['đu đủ']);
 const fruits=groups.find(g=>g.key==='fruits');
 fruits.members.push({id:'tamarind',label:pair('Tamarind','Me'),aliases:['tamarind','me chua','quả me','trái me'],molecules:[]});
 for(const g of groups)for(const m of g.members)for(const p of m.molecules)m.aliases.push(...(componentAliases[p.id]||[]));
 // Attach only named molecular identifiers as detection aliases; general protein families are ambiguous.
 groups.forEach(g=>g.members.forEach(m=>m.aliases.push(...m.molecules.map(p=>p.id))));
 const dish=(en,vi,keys,aliases=[])=>({label:pair(en,vi),keys,aliases:[en,vi,...aliases]});
 const dishes=[
  dish('Phở','Phở',['fish','soy','wheat'],['pho','phở bò','phở gà']),
  dish('Bún bò Huế','Bún bò Huế',['shellfish','fish','beef','pork'],['bun bo hue']),
  dish('Bún riêu','Bún riêu',['shellfish','fish','soy','egg'],['bun rieu']),
  dish('Bún mắm','Bún mắm',['fish','shellfish','mollusc'],['bun mam']),
  dish('Bún chả','Bún chả',['fish','soy','pork'],['bun cha']),
  dish('Bánh mì sandwich','Bánh mì',['wheat','egg','milk','soy','fish','pork'],['banh mi','bánh mì thịt']),
  dish('Vietnamese pancake','Bánh xèo',['shellfish','fish','soy','peanut','coconut','pork'],['banh xeo']),
  dish('Fresh spring rolls','Gỏi cuốn',['shellfish','fish','peanut','soy','pork'],['goi cuon']),
  dish('Fried spring rolls','Chả giò / nem rán',['shellfish','egg','fish','wheat','pork'],['cha gio','chả giò','nem rán']),
  dish('Broken rice plate','Cơm tấm',['fish','soy','egg','pork'],['com tam']),
  dish('Hủ tiếu','Hủ tiếu',['shellfish','fish','soy','pork'],['hu tieu']),
  dish('Mì Quảng','Mì Quảng',['peanut','shellfish','fish','egg'],['mi quang']),
  dish('Steamed rice rolls','Bánh cuốn',['fish','soy','pork'],['banh cuon']),
  dish('Vietnamese sweet soup','Chè',['peanut','milk','soy','coconut','legumes','sesame'],['che']),
  dish('Milk tea','Trà sữa',['milk','soy'],['tra sua']),
  dish('Vietnamese milk coffee','Cà phê sữa',['milk'],['ca phe sua']),
  dish('Egg coffee','Cà phê trứng',['egg','milk'],['ca phe trung']),
  dish('Sticky rice','Xôi',['peanut','sesame','coconut','egg','pork'],['xoi']),
  dish('Vegetarian meal','Món chay',['soy','wheat','peanut','sesame'],['mon chay']),
  dish('Pizza','Pizza',['wheat','milk','soy']),dish('Cake','Bánh ngọt',['wheat','egg','milk','tree_nut']),
  dish('Ice cream','Kem',['milk','egg','soy','tree_nut']),dish('Seafood hotpot','Lẩu hải sản',['fish','shellfish','mollusc','soy'],['lau hai san'])
 ];
 // Restore the previous Indian / Vietnamese menu vocabulary. Every association
 // remains an uncertain recipe possibility, irrespective of its old ranking.
 const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
 for(const prior of old?.dishes||[]){
  const aliases=[prior.name,...prior.aliases];
  const existing=dishes.find(d=>d.aliases.some(a=>aliases.some(b=>normal(a)===normal(b))));
  if(existing){existing.aliases=[...new Set([...existing.aliases,...aliases])];continue;}
  const keys=[...new Set([...(prior.likely||[]),...(prior.possible||[])])].filter(k=>groups.some(g=>g.key===k));
  dishes.push(dish(prior.name,prior.name,keys,prior.aliases));
 }
 const visualRecipes=[
  ['Dosa','Dosa',['legumes','milk','peanut','coconut'],['dosai','masala dosa']],
  ['Butter chicken','Gà sốt bơ',['milk','tree_nut'],['murgh makhani']],
  ['Bread / baguette','Bánh mì baguette',['wheat','milk','egg','sesame','soy'],['french loaf','baguette']],
  ['Hot dog','Bánh mì xúc xích',['wheat','milk','egg','soy'],['hotdog']],
  ['Bagel','Bánh bagel',['wheat','sesame','egg'],[]],['Pretzel','Bánh pretzel',['wheat','milk'],[]],
  ['Pasta carbonara','Mì Ý carbonara',['wheat','egg','milk'],['carbonara']],
  ['Burrito','Bánh burrito',['wheat','milk','soy'],[]],['Pot pie','Bánh nhân thịt',['wheat','milk','egg'],['potpie']],
  ['Meatloaf','Thịt nướng khuôn',['egg','wheat','milk'],['meat loaf']],
  ['Eggnog','Đồ uống trứng sữa',['egg','milk'],[]],['Trifle','Bánh trifle',['milk','egg','wheat','tree_nut'],[]],
  ['Waffle','Bánh waffle',['wheat','egg','milk'],[]],['Pancake','Bánh pancake',['wheat','egg','milk'],[]],
  ['Guacamole','Bơ nghiền guacamole',['fruits'],[]],['Mashed potato','Khoai tây nghiền',['vegetables','milk'],[]],
  ['Soup / broth','Súp / nước dùng',['celery','wheat','fish','soy'],['consomme','broth']]
 ];
 for(const args of visualRecipes)if(!dishes.some(d=>d.aliases.some(a=>normal(a)===normal(args[0]))))dishes.push(dish(...args));
 root.CLINICAL_CATALOG={version:'2026.11.09-v10.2',groups,dishes,sources,componentAliases,reviewed:'2026-11-09'};
})(typeof window!=='undefined'?window:globalThis);
