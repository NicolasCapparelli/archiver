import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(process.env.CODEX_NODE_MODULES, 'package.json'));
const { chromium } = require('playwright');
const stage = process.argv[2] || 'after';
const out = path.resolve('continuity/design/reading-room/qa/migration');
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];
const results = [];
for (const theme of ['dark','light']) {
  const cases = [['archivist',1280,850,1],['librarian',480,720,1],['archivist-small',900,400,1],['librarian-small',480,400,1]];
  if(stage==='after')cases.push(['librarian-125',480,720,1.25],['librarian-150',480,720,1.5],['librarian-200',480,720,2],['archivist-narrow',650,700,1]);
  for (const [role,width,height,scale] of cases) {
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:scale,reducedMotion:'reduce'});
    await page.route('http://127.0.0.1:1439/**', async route => {
      const url = new URL(route.request().url());
      const file = path.resolve('dist', '.' + (url.pathname==='/'?'/index.html':url.pathname));
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
      if(!file.startsWith(path.resolve('dist')+path.sep))throw Error('Unexpected asset path');
      await route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
    });
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(t=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('archiver-theme',t);sessionStorage.setItem('qa-initialized','1');}},theme);
    await page.goto('http://127.0.0.1:1439/'+(role.startsWith('librarian')?'?quick=1':''));
    await page.locator('.entry').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(out,`${stage}-${role}-${theme}.png`)});
    results.push(await page.evaluate(({role,theme,scale})=>({role,theme,scale,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,footer:document.querySelector('.quick-shell>footer')?.getBoundingClientRect().bottom,details:document.querySelector('.details')?.getBoundingClientRect().bottom,resultHeight:document.querySelector('.item-list')?.clientHeight,detailsVisible:!!document.querySelector('.details')?.getClientRects().length}),{role,theme,scale}));
    if(stage==='after') {
      if(await page.locator('.brand').getAttribute('aria-label')!== (role.startsWith('librarian')?'Archiver · Librarian':'Archiver · Archivist')) throw Error('Role identity failed');
      const search=page.getByRole('textbox',{name:/Search (library|full archive)/});
      await search.fill('unfindable-reading-room-fixture');
      await page.getByText('No matching records',{exact:true}).waitFor();
      await search.fill('');
      await page.locator('.entry').first().waitFor();
      await search.focus();
      await page.keyboard.press('F1');
      await page.getByRole('dialog').waitFor();
      await page.screenshot({path:path.join(out,`after-${role}-${theme}-shortcuts.png`)});
      await page.keyboard.press('Escape');
      if(role.startsWith('librarian')) {
        await search.focus(); await page.keyboard.press('Control+Shift+A');
        await page.getByRole('button',{name:'Switch back to library · Ctrl Shift A'}).waitFor();
        await page.getByRole('button',{name:'Switch back to library · Ctrl Shift A'}).click();
        await page.getByRole('textbox',{name:'Search library'}).waitFor();
        await page.keyboard.press('Control+t');
        await page.getByRole('dialog').waitFor();
        if(!await page.getByRole('button',{name:'Format JSON',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Transform initial focus failed');
        await page.keyboard.press('Enter');
        await page.getByRole('alert').waitFor();
        if(!await page.getByRole('button',{name:'Format JSON',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Transform error focus failed');
        await page.screenshot({path:path.join(out,`after-${role}-${theme}-transform-error.png`)});
        await page.keyboard.press('Escape');
        await search.focus();
        const selected = await page.locator('.entry.selected').getAttribute('id');
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(previous=>document.querySelector('.entry.selected')?.id!==previous,selected);
        await page.keyboard.press('Control+Shift+Backspace');
        await page.getByText('Your library is clear',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Include archive results · Ctrl Shift A'}).click();
        await page.locator('.entry').first().waitFor();
      } else {
        await page.getByRole('button',{name:'Filters & searches',exact:true}).click();
        await page.getByRole('dialog').waitFor();
        await page.screenshot({path:path.join(out,`after-${role}-${theme}-filters.png`)});
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Settings',exact:true}).click();
        await page.getByRole('heading',{name:'Archive settings'}).waitFor();
        await page.screenshot({path:path.join(out,`after-${role}-${theme}-settings.png`)});
        await page.getByRole('button',{name:theme==='dark'?'Warm paper':'Deep spruce',exact:true}).click();
        if(await page.evaluate(()=>document.documentElement.dataset.theme)===theme)throw Error('Theme toggle failed');
        await page.reload();
        if(await page.evaluate(()=>document.documentElement.dataset.theme)===theme)throw Error('Theme persistence failed');
      }
    }
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(out,`${stage}-report.json`),JSON.stringify({errors,results},null,2));
if(errors.length||(stage==='after'&&results.some(r=>r.scrollWidth>r.width||r.footer>r.height+1||(r.role==='archivist-small'&&(r.details>r.height+1||r.resultHeight<66))||(r.role.startsWith('archivist')&&!r.detailsVisible))))throw Error('Layout or runtime failure; inspect report');
console.log(`${stage}: ${results.length} viewport/theme cases captured; ${stage==='after'?'search, scope, F1, transforms/error focus, navigation, fixture library clear, filters, theme persistence checked.':'baseline captured.'}`);
