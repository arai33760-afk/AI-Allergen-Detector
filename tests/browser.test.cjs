// Real Chromium, real MobileNet/OCR downloads. No model or network mocks.
// The phone-sized viewport is emulation, not a physical Android device.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'..');
const photoUrl='https://raw.githubusercontent.com/mrdbourke/pytorch-deep-learning/main/images/04-pizza-dad.jpeg';
(async()=>{
 const server=spawn(process.execPath,[path.join(root,'serve.cjs')],{cwd:root,stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data');
 let browser,page;
 try{
  await fs.mkdir(path.join(root,'test-artifacts'),{recursive:true});
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true});
  page=await context.newPage();const errors=[];page.on('pageerror',err=>errors.push(err.message));
  page.on('requestfailed',req=>console.log('REQUEST_FAILED',req.url(),req.failure()?.errorText));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle'});
  await page.click('#editProfile');await page.fill('#profileName','Richard');
  await page.check('[data-all="egg"]');await page.check('[data-all="wheat"]');await page.click('#saveProfile');
  assert((await page.textContent('#profileSummary')).includes('Richard'));
  const response=await fetch(photoUrl);assert(response.ok,'Real photo fixture must download');
  const bytes=Buffer.from(await response.arrayBuffer());
  await page.setInputFiles('#imageInput',{name:'pizza.jpeg',mimeType:'image/jpeg',buffer:bytes});
  await page.click('#visionBtn');
  await page.waitForFunction(()=>/suggestions are ready|No reliable food|could not finish/.test(document.querySelector('#visionStatus').textContent),{},{timeout:135000});
  console.log('VISION_STATUS',await page.textContent('#visionStatus'));
  const recognized=await page.inputValue('#textInput');console.log('REAL_PHOTO_RESULT',recognized);
  assert.equal(recognized,'Pizza','Real pizza photo should connect to Pizza screening');
  assert((await page.textContent('#result')).includes('unconfirmed photo suggestion'));
  assert((await page.textContent('#result')).includes('Wheat'));
  assert.equal(await page.locator('#visionBtn').isEnabled(),true);
  assert.equal(await page.locator('#result .alert').count(),0);
  await page.screenshot({path:path.join(root,'test-artifacts','real-photo-mobile.png'),fullPage:true});
  await page.fill('#dishCorrect','Bánh mì');await page.click('#dishConfirmBtn');
  assert((await page.textContent('#result')).includes('Egg'));
  assert((await page.textContent('#result')).includes('Wheat'));
  assert((await page.textContent('#result')).includes('dish name you confirmed'));
  await page.selectOption('#language','vi');
  assert((await page.textContent('#result')).includes('Trứng'));
  await page.screenshot({path:path.join(root,'test-artifacts','confirmed-banh-mi-vietnamese.png'),fullPage:true});
  await page.selectOption('#language','en');await page.click('#visionBtn');
  await page.waitForFunction(()=>document.querySelector('#visionStatus').textContent.includes('suggestions are ready'),{},{timeout:30000});
  assert.equal(await page.inputValue('#textInput'),'Pizza');
  assert.equal(await page.locator('#imageInput').isEnabled(),true);
  // A deliberately synthetic printed label tests the actual OCR engine.
  const label=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1400,300);ctx.fillStyle='#000';ctx.font='54px Arial';ctx.fillText('Ingredients: WHEAT FLOUR, EGG.',40,150);return canvas.toDataURL('image/png').split(',')[1];});
  await page.setInputFiles('#imageInput',{name:'synthetic-label.png',mimeType:'image/png',buffer:Buffer.from(label,'base64')});
  await page.locator('details.advanced summary').click();await page.click('#ocrBtn');
  await page.waitForFunction(()=>/Text extracted|could not finish|No readable text|Cancelled/.test(document.querySelector('#ocrStatus').textContent),{},{timeout:135000});
  console.log('OCR_STATUS',await page.textContent('#ocrStatus'));
  const text=await page.inputValue('#textInput');assert(/WHEAT/i.test(text)&&/EGG/i.test(text),text);
  await page.click('#analyzeBtn');assert((await page.textContent('#notice')).includes('Review the OCR'));
  await page.check('#confirmOcr');await page.click('#analyzeBtn');
  assert.equal(await page.locator('#result .alert').count(),1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'No mobile horizontal overflow');
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log(JSON.stringify({realPhoto:recognized,repeatScan:true,confirmedDish:'Bánh mì',profile:'Richard',allergens:['egg','wheat/gluten'],actualOcr:true,viewport:'393x873',physicalAndroid:false}));
 }finally{
  if(page)await page.screenshot({path:path.join(root,'test-artifacts','last-screen.png'),fullPage:true}).catch(()=>{});
  if(browser)await browser.close();server.kill();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
