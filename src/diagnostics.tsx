import { useEffect,useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "./api";
type Health={storage:{pages:number;pageBytes:number;freePages:number;items:number;occurrences:number;integrity:string;journal:string};databaseBytes:number;walBytes:number;spoolPending:number;invalidReports:number;paused:boolean;clipboard:string;error:string|null;ocrError:string|null;platform:string;dataPath:string};
type Repair={previewCommand:string;repairCommand:string};
const bytes=(n:number)=>`${(n/1024/1024).toFixed(1)} MiB`;
export function Diagnostics(){
  const [health,setHealth]=useState<Health>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[repair,setRepair]=useState<Repair>(),[approved,setApproved]=useState(false);
  async function run(fn:()=>Promise<unknown>){setBusy(true);setMessage("");try{await fn();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
  async function refresh(check=false){if(native)setHealth(await invoke<Health>("archive_health",{check}));}
  useEffect(()=>{void refresh().catch(e=>setMessage(String(e)));},[]);
  async function copy(text:string){await navigator.clipboard.writeText(text);setMessage("Copied.");}
  return <div className="setting-card">
    <h3>Capture & storage health</h3>
    <button className="secondary" disabled={!native||busy} onClick={()=>void run(()=>refresh())}>Refresh diagnostics</button>
    <button className="secondary" disabled={!native||busy} onClick={()=>void run(()=>refresh(true))}>Check storage</button>
    {health&&<>
      <p>Capture: {health.paused?"Paused by preference":"Enabled"} · Clipboard: {health.clipboard}</p>
      <p>{health.storage.items} items · {health.storage.occurrences} occurrences · Database {bytes(health.databaseBytes)} · WAL {bytes(health.walBytes)} · {health.storage.journal.toUpperCase()} journal</p>
      <p>Allocated pages: {bytes(health.storage.pages*health.storage.pageBytes)} · Reusable pages: {bytes(health.storage.freePages*health.storage.pageBytes)}. Free pages are reusable database capacity, not free disk space.</p>
      <p>SQLite quick check: {health.storage.integrity}. Pending shell files: {health.spoolPending}; unreadable shell reports: {health.invalidReports}.</p>
      <p className="diagnostic-code">Archive folder: {health.dataPath}</p>
      <p>Last capture error (retained until restart): {health.error||"None recorded"}<br/>Last OCR error: {health.ocrError||"None recorded"}</p>
      <button className="secondary" disabled={busy} onClick={()=>void run(()=>copy(`Archiver diagnostics\nPlatform: ${health.platform}\nCapture: ${health.paused?"paused":"enabled"}\nArchive: ${health.storage.items} items, ${health.storage.occurrences} occurrences\nSQLite quick check: ${health.storage.integrity==="ok"?"ok":"not checked or needs attention"}\nDatabase: ${bytes(health.databaseBytes)}; WAL: ${bytes(health.walBytes)}\nPending shell files: ${health.spoolPending}; unreadable reports: ${health.invalidReports}\nCapture error recorded: ${!!health.error}; OCR error recorded: ${!!health.ocrError}`))}>Copy safe diagnostic summary</button>
      <p>The copied summary excludes clip content, paths, session identifiers and error details. Copying itself may be captured while clipboard capture is enabled.</p>
      <p>PowerShell needs an interactive PSReadLine prompt. CMD capture and insertion require Clink. Plain CMD has no adapter. Bash, Zsh, Fish and WSL hooks are experimental; WSL process IDs cannot be verified by Windows. Insertion writes an editing buffer without pressing Enter.</p>
      {health.platform==="windows"?<>
        <button className="secondary" disabled={busy} onClick={()=>void run(async()=>{setRepair(await invoke<Repair>("prepare_shell_repair"));setApproved(false);setMessage("Repair tools prepared. No profiles changed.");})}>Prepare PowerShell repair</button>
        {repair&&<><p>The existing installer updates the Archiver block in your current-user Windows PowerShell and PowerShell profiles and saves existing profiles as .archiver-backup before the first change. Unrelated profile text is retained. This repair skips CMD/Clink; use the project installer explicitly to configure Clink. Restart shells afterwards.</p><pre className="diagnostic-code">{repair.previewCommand}</pre><button className="secondary" disabled={busy} onClick={()=>void run(()=>copy(repair.previewCommand))}>Copy preview command</button><button className="secondary" disabled={busy} onClick={()=>void run(()=>copy(repair.repairCommand))}>Copy repair command</button><label><input type="checkbox" disabled={busy} checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve updating these PowerShell profiles using the existing installer.</label><button className="primary" disabled={busy||!approved} onClick={()=>void run(async()=>{setMessage(await invoke<string>("repair_shell_integration",{approved}));setApproved(false);})}>Run PowerShell repair</button></>}
      </>:<p>For Unix hooks, review and run integrations/install-unix.sh from the project. Restart the shell after installing.</p>}
    </>}
    {message&&<p role="status" className="diagnostic-code">{message}</p>}
  </div>;
}
