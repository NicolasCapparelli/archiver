import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "./api";
type Preview = {token:string;checksum:string;replacement:boolean;items:number;snippets:number;occurrences:number;currentItems:number;currentSnippets:number;currentOccurrences:number;addedItems:number;backupPath:string|null};
export function ArchiveImport() {
  const [path,setPath]=useState(""),[backup,setBackup]=useState(""),[replacement,setReplacement]=useState(false),[approved,setApproved]=useState(false),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  function reset(){setPreview(undefined);setApproved(false);setMessage("");}
  async function run(apply:boolean){
    setBusy(true);setMessage("");
    try {
      if(apply && preview){
        const report=await invoke<Preview>("apply_archive_import",{token:preview.token,approved});
        setPreview(undefined);setApproved(false);
        setMessage(report.replacement?`Archive restored. Verified pre-restore backup: ${report.backupPath}`:`Import complete: ${report.addedItems} new archived items. Existing library visibility and local annotations were preserved.`);
      }else{setPreview(undefined);setApproved(false);setPreview(await invoke<Preview>("preview_archive_import",{path,replacement,backupPath:replacement?backup:null}));}
    }catch(e){setMessage(String(e));setPreview(undefined);setApproved(false);}finally{setBusy(false);}
  }
  return <div className="setting-card">
    <h3>Import or restore archive</h3>
    <p>Choose a portable JSONL export or a closed SQLite backup, with its adjacent checksum file. Validation and a conflict check happen before any archive changes. Limits: 256 MiB, 250,000 rows and 32 MiB per JSONL record.</p>
    <label>Absolute archive path<input className="setting-input" disabled={busy} value={path} onChange={e=>{reset();setPath(e.target.value);}} /></label>
    <label>Import mode<select className="setting-input" disabled={busy} value={replacement?"replace":"merge"} onChange={e=>{reset();setReplacement(e.target.value==="replace");}}><option value="merge">Merge into current archive</option><option value="replace">Replace archive from SQLite backup</option></select></label>
    {replacement?<><p>Replacement restores archive records, snippets, groups, saved searches, revisions and recovery records. Current archive data is replaced. App preferences and shell profiles stay separate. A verified backup of the current archive is required.</p><label>New absolute pre-restore backup path<input className="setting-input" disabled={busy} value={backup} onChange={e=>{reset();setBackup(e.target.value);}} /></label></>:<p>Merge keeps existing local notes, pin names and library visibility for matching content. New content retains its exported visibility. Conflicting snippets or occurrences stop the entire import; no partial merge.</p>}
    <button className="secondary" disabled={!native||busy||!path||(replacement&&!backup)} onClick={()=>void run(false)}>Validate & preview</button>
    {preview&&<div className="archive-import-preview" aria-live="polite">
      <p>Incoming: {preview.items} items, {preview.snippets} snippets, {preview.occurrences} occurrences. Current archive: {preview.currentItems} items, {preview.currentSnippets} snippets, {preview.currentOccurrences} occurrences. {preview.replacement?"Current archive will be replaced.":`${preview.addedItems} new items will be added; matching records are skipped.`}</p>
      <p className="diagnostic-code">SHA-256: {preview.checksum}</p>
      {preview.replacement&&<><p>Pre-restore backup: {preview.backupPath}</p><label><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)}/> I approve replacing the current archive with this validated backup.</label></>}
      <button className="primary" disabled={busy||(preview.replacement&&!approved)} onClick={()=>void run(true)}>{preview.replacement?"Back up current archive & restore":"Import validated archive"}</button>
      <p>If capture changes the archive after this preview, validate again. Capture writes wait during the transaction and then resume.</p>
    </div>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
