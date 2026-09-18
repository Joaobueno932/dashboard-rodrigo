/** Run against a disposable server: BASE_URL and E2E_PASSWORD are required. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'frontend/package.json'));
const {chromium}=require('@playwright/test');
const base=process.env.BASE_URL??'http://127.0.0.1:8000';
if(!process.env.E2E_PASSWORD)throw Error('Use um servidor descartável e informe E2E_PASSWORD.');
const screenshotDir=process.env.SCREENSHOT_DIR;
if(screenshotDir)await mkdir(screenshotDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const routes=[['ambiental/agua',2],['ambiental/energia',3],['ambiental/consumo',1],['ambiental/logistica',1],['ambiental/mudancas-climaticas',1],['social/pessoas',1],['social/diversidade',3],['social/treinamento',1],['governanca/compliance',1],['governanca/transparencia',2]];
try{
 await page.goto(base);
 await page.locator('.dimension-card').first().waitFor();
 assert.equal(await page.locator('.dimension-card').count(),3);
 if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'inicio.png'),fullPage:true});
 for(const dim of ['ambiental','social','governanca']){
  await page.locator(`.dimension-card[href="/${dim}"]`).click();
  await page.locator('.topic-card').first().waitFor();
  await page.locator('.back-link').click();
 }
 for(const [route,count] of routes){
  await page.goto(`${base}/${route}`);
  await page.locator('.chart-card').first().waitFor();
  assert.equal(await page.locator('.chart-card').count(),count);
  assert.equal(await page.getByLabel('Casa',{exact:true}).count(),route.startsWith('governanca')?0:1);
  const years=await page.getByLabel('Ano',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value));
  for(const year of years){
   await page.getByLabel('Ano',{exact:true}).selectOption(year);
   assert.ok(!(await page.locator('main').innerText()).match(/NaN|undefined|Infinity/));
  }
  const houses=page.getByLabel('Casa',{exact:true});
  if(await houses.count()){
   const values=await houses.locator('option').evaluateAll(options=>options.map(o=>o.value));
   for(const value of values)await houses.selectOption(value);
   await houses.selectOption('all');
  }
  if(route==='ambiental/energia'){
   await page.getByLabel('Ano',{exact:true}).selectOption('2025');
   if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'energia.png'),fullPage:true});
   await houses.selectOption('SESI');
   assert.equal(await page.getByText('Sem detalhamento por Casa').count(),1);
  }
  console.log(`PASS /${route}: gráficos, anos, Casas e valores finitos`);
 }
 await page.goto(`${base}/configuracoes`);
 await page.getByLabel('Senha administrativa').fill(process.env.E2E_PASSWORD);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Atualizar planilha',{exact:true}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'corrompido.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('invalid')});
 await page.getByRole('button',{name:'Validar planilha',exact:true}).click();
 await page.getByRole('alert').waitFor();
 await page.locator('input[type=file]').setInputFiles(path.join(root,'data/source/indicadores.xlsx'));
 await page.getByRole('button',{name:'Validar planilha',exact:true}).click();
 await page.getByText('Apta para importação',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.locator('input[type=file]').waitFor();
 await page.locator('input[type=file]').setInputFiles(path.join(root,'data/source/indicadores.xlsx'));
 await page.getByRole('button',{name:'Validar planilha',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar atualização da base',exact:true}).waitFor();
 if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'importacao.png'),fullPage:true});
 await page.getByRole('button',{name:'Confirmar atualização da base',exact:true}).click();
 await page.getByText('Base atualizada com sucesso.',{exact:false}).waitFor();
 await page.reload();
 await page.getByText('Atualizar planilha',{exact:true}).waitFor();
 assert.equal(await page.getByText('Apta para importação',{exact:true}).count(),0);
 console.log('PASS importação: rejeição, cancelamento, confirmação, sessão e recarga');
 for(const width of [390,768]){
  await page.setViewportSize({width,height:844});
  for(const route of ['','ambiental','ambiental/energia','social/diversidade','configuracoes']){
   await page.goto(`${base}/${route}`);
   await page.locator('h1').waitFor();
   await page.waitForTimeout(250);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Overflow ${width} /${route}`);
  }
  if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,`mobile-${width}.png`),fullPage:true});
 }
 console.log('PASS responsividade: 390 px e 768 px');
 // Expected HTTP error from deliberately corrupt upload / initial unauthenticated session.
 const unexpected=errors.filter(e=>!e.includes('status of 401')&&!e.includes('status of 422'));
 assert.deepEqual(unexpected,[]);
 console.log('PASS console: sem erros JavaScript');
}finally{await browser.close();}
