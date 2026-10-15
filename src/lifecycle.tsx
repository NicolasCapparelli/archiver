import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "./api";
export function Lifecycle() {
  const [enabled, setEnabled] = useState<boolean>(),
    [update, setUpdate] = useState<{ version: string; notes: string | null }>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (native)
      invoke<boolean>("startup_status")
        .then(setEnabled)
        .catch((e) => setMessage(String(e)));
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setting-card">
      <h3>Startup & updates</h3>
      <p>
        Launch quietly into the tray at sign-in. Enable after installing
        Archiver to a stable location.
      </p>
      <button
        className="secondary"
        disabled={busy || enabled === undefined}
        onClick={() =>
          void run(async () => {
            await invoke("launch_at_signin", { enabled: !enabled });
            setEnabled(!enabled);
          })
        }
      >
        {enabled ? "Disable launch at sign-in" : "Enable launch at sign-in"}
      </button>
      <p>
        Updates are checked manually and verified with the public key embedded
        in the release build. Download and installation happen only when
        requested.
      </p>
      <button
        className="secondary"
        disabled={busy || !native}
        onClick={() =>
          void run(async () => {
            setUpdate(undefined);
            const result = await invoke<typeof update | null>("check_updates");
            if (result) setUpdate(result);
            else setMessage("This release is up to date.");
          })
        }
      >
        Check for updates
      </button>
      {update && (
        <>
          <p>Version {update.version} available</p>
          <pre>{update.notes}</pre>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await invoke("install_update");
                setMessage(
                  "Update installed. Restart Archiver if it has not closed automatically.",
                );
              })
            }
          >
            Download, verify & install update
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
