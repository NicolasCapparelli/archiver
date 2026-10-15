/* Standalone visual study. No archive, Tauri, network, or clipboard access. */
const paths = {
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  book:'<path d="M12 6v15M3 3h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v17h-5a4 4 0 0 0-4 1 4 4 0 0 0-4-1H3Z"/>',
  archive:'<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M10 12h4"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5"/>',
  terminal:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4M13 16h5"/>',
  clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/>',
  pin:'<path d="m16 3 5 5-4 2v5l-3 3-3-3-6 6M3 8l5-5 2 4h5l3 3"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  link:'<path d="M15 7h3a4 4 0 0 1 0 8h-3M9 7H6a4 4 0 0 0 0 8h3M8 11h8"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m21 15-5-5L5 21"/>',
  settings:'<path d="m12 3 3 2 3 1 1 3 2 3-2 3-1 3-3 1-3 2-3-2-3-1-1-3-2-3 2-3 1-3 3-1Z"/><circle cx="12" cy="12" r="3"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  alert:'<path d="m12 3 10 18H2ZM12 9v5M12 17h.01"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const mark = () => `<svg class="mark" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M32 5h6a3 3 0 0 1 3 3v3l14 3a3 3 0 0 1 2 3v32a2 2 0 0 1-3 2l-9-2V21a5 5 0 0 0-4-5l-12-3V8a3 3 0 0 1 3-3Z"/><path d="M21 12h5a3 3 0 0 1 3 3v2l11 3a3 3 0 0 1 2 3v32a2 2 0 0 1-3 2l-8-2V30a5 5 0 0 0-4-5l-9-2v-8a3 3 0 0 1 3-3Z"/><path d="M10 21h5a3 3 0 0 1 3 3v2l8 2a3 3 0 0 1 2 3v27a2 2 0 0 1-3 2l-4-1-3-17c-.3-1.8-1.5-1.9-2.2-.2L10 55l-2-.6a3 3 0 0 1-2-3V24a3 3 0 0 1 4-3Z"/></svg>`;
const sample = [
  {title:'git log --oneline -12',kind:'command',type:'terminal',meta:'PowerShell · C:\\work\\archiver',age:'2m',repeat:'3 events'},
  {title:'Notes for the next release',kind:'text',type:'file',meta:'Text · VS Code',age:'8m',repeat:''},
  {title:'Local search architecture',kind:'url',type:'link',meta:'URL · Browser',age:'14m',repeat:'Pinned'},
  {title:'Layout reference.png',kind:'image',type:'image',meta:'Image · 1600 × 900 · OCR ready',age:'26m',repeat:''},
  {title:'cargo test library',kind:'command',type:'terminal',meta:'PowerShell · C:\\work\\archiver',age:'41m',repeat:''},
  {title:'npm run build',kind:'command',type:'terminal',meta:'PowerShell · Exit code 1',age:'1h',repeat:'Failed'},
];
const esc = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const record = (s,i,selected=0) => `<button class="record ${selected===i?'selected':''}" data-record="${i}" aria-pressed="${selected===i}" aria-label="Select sample ${esc(s.title)}"><span class="record-icon ${s.kind}">${icon(s.type)}</span><span class="record-body"><span class="record-title ${s.kind==='command'?'mono':''}">${esc(s.title)}</span><span class="record-meta ${s.repeat==='Failed'?'danger':''}">${s.repeat==='Failed'?icon('alert'):''}${esc(s.meta)}${s.repeat==='3 events'?' · 3 events':''}</span></span><span class="record-end">${s.repeat==='Pinned'?icon('pin'):''}<span>${s.age}</span>${selected===i?icon('chevron'):''}</span></button>`;
function quickMarkup(archive=false,state='results') {
  let results = `<div class="q-group">Recent ${archive?'archive records':'library items'}</div>${sample.map((s,i)=>record(s,i)).join('')}`;
  if(state!=='results'){
    const title = {empty:'Your library is clear','no-match':'No matching records',error:'Search could not complete'}[state];
    const copy = {empty:'Your history is still in the archive. Include archive results to find it here.','no-match':'Try a different word or another filter.',error:'Try the search again. Your archived history has not changed.'}[state];
    results = `<div class="q-empty ${state==='error'?'danger':''}">${icon(state==='error'?'alert':'archive')}<h4>${title}</h4><p>${copy}</p>${state==='empty'?'<button class="scope-chip" data-demo-scope>Include archive results</button>':''}${state==='error'?'<button class="secondary" data-demo-retry>Retry search</button>':''}</div>`;
  }
  return `<div class="q-header"><div class="window-brand">${mark()}<span>Librarian</span></div><button class="icon-button" aria-label="Close sample panel" data-preview-action="Close panel">${icon('close')}</button></div><div class="q-destination"><span>To: Visual Studio Code</span><button data-preview-action="Open Archivist">Archivist <kbd>Ctrl Shift O</kbd></button></div><div class="q-search">${icon('search')}<span class="placeholder">Search ${archive?'full archive':'library'}…</span><span class="scope-chip ${archive?'archive-scope':''}">${archive?'Archive':'Library'}</span></div><div class="q-tabs"><button class="tab active" data-preview-tab="All">All</button><button class="tab" data-preview-tab="Clipboard">Clipboard</button><button class="tab" data-preview-tab="Commands">Commands</button><button class="tab" data-preview-tab="Pinned">Pinned</button></div><div class="q-results">${results}</div><div class="q-footer"><span><kbd>↑ ↓</kbd> select</span><span><kbd>↵</kbd> copy</span><span><kbd>Ctrl ↵</kbd> paste</span><span><kbd>Ctrl T</kbd> transform</span><button data-preview-action="All shortcuts"><kbd>F1</kbd> all keys</button></div>`;
}
function detailsMarkup(i=0) {
  const s=sample[i];
  const isCommand=s.kind==='command';
  return `<div class="detail-eyebrow">RECORD DETAILS</div><span class="record-icon ${s.kind}">${icon(s.type)}</span><h4>${isCommand?'Command':s.kind==='image'?'Image':s.kind==='url'?'URL':'Text'} record</h4><p>${isCommand?'Exact content preserved':'Original representation preserved'}</p><div class="content-sample">${esc(s.title)}</div><div class="detail-buttons"><button class="primary" data-preview-action="Copy ${isCommand?'command':'record'}">${icon('copy')}Copy ${isCommand?'command':'record'}</button>${isCommand?'<button class="secondary" data-preview-action="Insert without running">Insert in shell</button>':''}<button class="secondary" data-preview-action="Add to library">${icon('book')}Add to library</button><button class="secondary" data-preview-action="Pin record">${icon('pin')}Pin record</button></div><dl><dt>Captured</dt><dd>Oct 12, 2026 · 4:32 PM</dd><dt>Source</dt><dd>${isCommand?'PowerShell':'Clipboard'}</dd><dt>Directory</dt><dd class="mono">${isCommand?'C:\\work\\archiver':'Not recorded'}</dd><dt>Completion</dt><dd class="${s.repeat==='Failed'?'danger':''}">${isCommand?(s.repeat==='Failed'?'Failed · Exit 1':'Success · Exit 0 · 0.2s'):'Not applicable'}</dd><dt>Library</dt><dd>Not in library</dd></dl><div class="detail-history"><strong>${i===0?'3 capture events':'Capture history'}</strong><div class="event-row"><b>Today · 4:32 PM</b><br>${isCommand?'PowerShell · Exit '+(s.repeat==='Failed'?'1':'0'):'Clipboard capture'}</div>${i===0?'<div class="event-row"><b>Today · 2:18 PM</b><br>PowerShell · Exit 0</div><div class="event-row"><b>Yesterday · 5:44 PM</b><br>PowerShell · Exit 0</div>':''}</div>`;
}
function archiveMarkup(){
  const nav=[['layers','All history'],['clipboard','Clipboard'],['terminal','Commands'],['pin','Pinned'],['file','Snippets'],['alert','Failed commands'],['link','URLs']];
  return `<aside class="a-sidebar"><div class="window-brand">${mark()}<span>Archivist</span></div><div class="workspace-label">Personal archive<small>Stored on this device</small></div><div class="nav-eyebrow">THE ARCHIVE</div><div class="a-nav">${nav.map(([ic,name],i)=>`<button class="${i===0?'active':''}" data-preview-nav="${name}">${icon(ic)}${name}</button>`).join('')}</div><div class="a-sidebar-bottom"><div class="a-nav"><button data-preview-action="Settings">${icon('settings')}Settings</button></div><div class="local-note">${icon('archive')}<div>Permanent history<small>Archiver / 0.1.0</small></div></div></div></aside><div class="a-main"><div class="a-topbar"><div class="a-breadcrumb">Personal archive ${icon('chevron')}<span>All history</span></div><div class="capture-state"><span class="status-dot"></span>Capture active <button aria-label="Pause sample capture" data-preview-action="Pause capture">${icon('pause')}</button></div></div><div class="a-heading"><div><h3>Your archive</h3><p>Your clips and commands, kept in one place.</p></div><button class="secondary" data-preview-action="Open Librarian">${icon('book')}Librarian <kbd>Ctrl Win .</kbd></button></div><div class="a-summary"><span><b>1,284</b> archived items</span><span><b>426</b> commands</span><span><b>2,916</b> capture events</span></div><div class="a-columns"><section class="a-feed"><div class="a-feed-heading"><span>Recent records</span><button class="secondary" data-preview-action="New snippet">New snippet</button></div><div class="q-search">${icon('search')}<span class="placeholder">Search the archive…</span><kbd>Ctrl K</kbd></div><div class="a-filterline"><span class="scope-chip archive-scope">Full archive</span><button class="secondary" data-preview-action="Filters">Filters</button><button class="secondary" data-preview-action="Saved searches">Saved searches</button></div><div class="a-results"><div class="q-group">Today · newest first</div>${sample.map((s,i)=>record(s,i)).join('')}<div class="q-group">More records in permanent history</div></div></section><aside class="a-detail">${detailsMarkup()}</aside></div><div class="a-bottom"><span>Stored locally · Capture active</span><span>Copy, paste, and insert remain separate actions</span></div></div>`;
}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.getElementById('quick-light').innerHTML=quickMarkup();
document.getElementById('quick-dark').innerHTML=quickMarkup();
document.getElementById('archive-light').innerHTML=archiveMarkup();
document.getElementById('archive-dark').innerHTML=archiveMarkup();
let dark=false,archive=false;
const status=document.createElement('div');status.setAttribute('role','status');status.className='preview-status';status.hidden=true;document.body.appendChild(status);
let statusTimer;
function announce(message){status.textContent='Study preview: '+message;status.hidden=false;clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.hidden=true,3500);}
document.getElementById('theme-toggle').addEventListener('click',e=>{
  dark=!dark;
  document.querySelectorAll('#librarian .mock,#archivist .mock,#components .mock').forEach(el=>el.dataset.theme=dark?'dark':'light');
  e.currentTarget.textContent=dark?'Preview light theme':'Preview dark theme';e.currentTarget.setAttribute('aria-pressed',String(dark));
});
function updateQuick(){document.getElementById('quick-light').innerHTML=quickMarkup(archive,document.getElementById('quick-state').value);const button=document.getElementById('scope-toggle');button.textContent=archive?'Preview library scope':'Preview archive scope';button.setAttribute('aria-pressed',String(archive));}
document.getElementById('scope-toggle').addEventListener('click',()=>{archive=!archive;if(archive&&document.getElementById('quick-state').value==='empty')document.getElementById('quick-state').value='results';updateQuick();});
document.getElementById('quick-state').addEventListener('change',e=>{if(e.target.value==='empty')archive=false;updateQuick();});
document.addEventListener('click',e=>{
  const scope=e.target.closest('[data-demo-scope]');if(scope){archive=true;document.getElementById('quick-state').value='results';updateQuick();return;}
  if(e.target.closest('[data-demo-retry]')){document.getElementById('quick-state').value='results';updateQuick();return;}
  const row=e.target.closest('[data-record]');if(row){const container=row.closest('.mock');container.querySelectorAll('[data-record]').forEach(el=>{el.classList.toggle('selected',el===row);el.setAttribute('aria-pressed',String(el===row));});const detail=container.querySelector('.a-detail');if(detail)detail.innerHTML=detailsMarkup(Number(row.dataset.record));return;}
  const tab=e.target.closest('[data-preview-tab]');if(tab){const container=tab.closest('.quick');container.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el===tab));const which=tab.dataset.previewTab;container.querySelector('.q-results').innerHTML=`<div class="q-group">Sample ${which.toLowerCase()} results</div>`+sample.map((s,i)=>({All:true,Clipboard:s.kind!=='command',Commands:s.kind==='command',Pinned:s.repeat==='Pinned'}[which]?record(s,i,-1):'')).join('');return;}
  const nav=e.target.closest('[data-preview-nav]');if(nav){const container=nav.closest('.mock');container.querySelectorAll('[data-preview-nav]').forEach(el=>el.classList.toggle('active',el===nav));announce(nav.dataset.previewNav+' selected; full navigation is part of the implementation handoff.');return;}
  const action=e.target.closest('[data-preview-action]');if(action){announce(action.dataset.previewAction+' — visual study only.');return;}
  const specimen=e.target.closest('.specimen button');if(specimen)announce(specimen.textContent.trim()+' — visual specimen only.');
});
