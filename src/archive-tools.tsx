import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native, type ShellSession } from "./api";
import * as api from "./api";
export function RecoveryAndBackup() {
  const [hours, setHours] = useState(0),
    [deleted, setDeleted] = useState<[string, number][]>([]),
    [path, setPath] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const p = await api.preferences();
    setHours(p.recoveryHours || 0);
    if (native) setDeleted(await invoke("recovery_items"));
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await fn();
      setMessage(
        typeof result === "string" ? `Verified SHA-256: ${result}` : "Done",
      );
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="setting-card">
        <h3>Deletion recovery</h3>
        <p>
          Disabled by default. Set an explicit recovery window before deleting
          to retain recoverable content. Expired recovery records are purged.
          Backups retain the database as it existed when created.
        </p>
        <label>
          Recovery hours (0 disables)
          <input
            className="setting-input"
            type="number"
            min="0"
            max="8760"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              api.savePreferences({
                ...(await api.preferences()),
                recoveryHours: hours,
              }),
            )
          }
        >
          Save recovery window
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          Refresh deleted items
        </button>
        {deleted.map(([id, expires]) => (
          <div key={id}>
            <span>
              {id} · recoverable until {new Date(expires).toLocaleString()}
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => invoke("undo_delete", { id }))}
            >
              Restore item
            </button>
          </div>
        ))}
      </div>
      <div className="setting-card">
        <h3>Portable exports & verified backups</h3>
        <p>
          JSONL exports include original representations as base64 and
          occurrence metadata. SQLite backups also retain snippets, settings
          stored in the archive, and any recovery records. Choose a new absolute
          filename; existing files are preserved.
        </p>
        <label>
          Output or backup path
          <input
            className="setting-input"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !path || !native}
          onClick={() =>
            void run(() => invoke("export_archive", { path, backup: false }))
          }
        >
          Export JSONL
        </button>
        <button
          className="primary"
          disabled={busy || !path || !native}
          onClick={() =>
            void run(() => invoke("export_archive", { path, backup: true }))
          }
        >
          Create verified SQLite backup
        </button>
        <button
          className="secondary"
          disabled={busy || !path || !native}
          onClick={() => void run(() => invoke("verify_backup", { path }))}
        >
          Verify existing backup
        </button>
        <p>
          Backups are checked for SQLite integrity and foreign keys. An adjacent
          .sqlite.sha256 file records the checksum. App preferences and shell
          profiles are separate from the database.
        </p>
      </div>
      {message && <p role="status">{message}</p>}
    </>
  );
}
export function IntegrationHealth() {
  const [rows, setRows] = useState<
      { session: ShellSession; connection: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const update = () => {
      if (native)
        invoke<typeof rows>("integration_health")
          .then((rows) => {
            if (live) {
              setRows(rows);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(String(e));
          });
    };
    update();
    const timer = setInterval(update, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="setting-card">
      <h3>Shell connections</h3>
      <p>
        Live native processes are checked. WSL reports are shown separately
        because Linux process IDs cannot be verified by the Windows app.
      </p>
      {rows.length === 0 && (
        <p>
          No shell reports yet. Install adapters, then open an interactive
          shell.
        </p>
      )}
      {rows.map(({ session: s, connection }) => (
        <div className="shell-health" key={s.session}>
          <strong>
            {s.source} · {connection}
          </strong>
          <p>
            {s.ready ? "At prompt" : "Busy"} ·{" "}
            {s.insertion ? "Insertion enabled" : "Insertion unavailable"} · PID{" "}
            {s.pid}
          </p>
          <small>
            {s.directory}
            <br />
            Last report: {new Date(s.updatedAt).toLocaleString()}
          </small>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
type Occurrence = {
  id: string;
  firstSeen: number;
  lastSeen: number;
  source: string;
  directory: string;
  session: string;
  repeats: number;
  successful: boolean | null;
  exitCode: number | null;
  durationMs: number | null;
};
export function Timeline({ id }: { id: string }) {
  const [rows, setRows] = useState<Occurrence[]>([]),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRows([]);
    setError("");
    setMore(false);
    if (native)
      invoke<Occurrence[]>("occurrence_timeline", { id, offset: 0 })
        .then((r) => {
          if (live) {
            setRows(r);
            setMore(r.length === 50);
          }
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [id]);
  async function load() {
    setBusy(true);
    try {
      const r = await invoke<Occurrence[]>("occurrence_timeline", {
        id,
        offset: rows.length,
      });
      setRows((p) => [...p, ...r]);
      setMore(r.length === 50);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (id.startsWith("snippet:")) return null;
  return (
    <details className="occurrence-timeline">
      <summary>Occurrence timeline</summary>
      {rows.map((r) => (
        <article key={r.id}>
          <strong>{new Date(r.firstSeen).toLocaleString()}</strong>
          <p>
            {r.source}
            {r.directory && ` · ${r.directory}`}
          </p>
          {r.repeats > 1 && (
            <small>
              {r.repeats} rapid copies grouped through{" "}
              {new Date(r.lastSeen).toLocaleTimeString()}
            </small>
          )}
          {r.successful !== null && (
            <small>
              {r.successful ? "Succeeded" : "Failed"}
              {r.exitCode !== null && ` · exit ${r.exitCode}`} · {r.durationMs}{" "}
              ms
            </small>
          )}
        </article>
      ))}
      {more && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          More occurrences
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </details>
  );
}
export function HistoryImport() {
  const [path, setPath] = useState(""),
    [format, setFormat] = useState("powershell"),
    [count, setCount] = useState<number>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(preview: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (!native) throw Error("History imports require the desktop app");
      const n = await invoke<number>("import_history", {
        path,
        format,
        preview,
      });
      if (preview) setCount(n);
      else {
        setCount(undefined);
        setMessage(`${n} new occurrences imported. Existing imports skipped.`);
      }
    } catch (e) {
      setMessage(String(e));
      setCount(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setting-card">
      <h3>Import shell history</h3>
      <p>
        PowerShell: use (Get-PSReadLineOption).HistorySavePath. Clink: export
        with clink history --bare to a UTF-8 file. Imports record the import
        time; original directories, durations, and execution times are
        unavailable.
      </p>
      <label>
        History format
        <select
          className="setting-input"
          value={format}
          onChange={(e) => {
            setFormat(e.target.value);
            setCount(undefined);
          }}
        >
          <option value="powershell">PowerShell / PSReadLine</option>
          <option value="clink">Clink bare export</option>
        </select>
      </label>
      <label>
        Absolute file path
        <input
          className="setting-input"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setCount(undefined);
          }}
        />
      </label>
      <button
        className="secondary"
        disabled={busy || !path}
        onClick={() => void run(true)}
      >
        Check import
      </button>
      {count !== undefined && (
        <>
          <p>
            {count} commands found. Repeated imports of the same file preserve
            duplicates within the file without adding them again.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(false)}
          >
            Import history
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
