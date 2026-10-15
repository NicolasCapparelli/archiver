import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { native, copy, preferences, savePreferences, type Item } from "./api";
type Record = { text: string; language: string; error: string };
type Status = {
  images: number;
  scanned: number;
  failed: number;
  running: boolean;
  error?: string | null;
};
export function OcrSettings() {
  const [status, setStatus] = useState<Status>(),
    [message, setMessage] = useState(""),
    [starting, setStarting] = useState(false);
  const [interval, setIntervalValue] = useState(7200);
  const [onCapture, setOnCapture] = useState(true);
  async function refresh() {
    if (native) setStatus(await invoke("ocr_status"));
  }
  useEffect(() => {
    void preferences()
      .then((p) => {
        setIntervalValue(p.ocrIntervalSeconds ?? 7200);
        setOnCapture(p.ocrOnCapture ?? true);
      })
      .catch((e) => setMessage(String(e)));
    void refresh().catch((e) => setMessage(String(e)));
    const timer = setInterval(
      () => void refresh().catch((e) => setMessage(String(e))),
      2000,
    );
    return () => clearInterval(timer);
  }, []);
  async function start() {
    setStarting(true);
    try {
      setMessage("Scanning in the background…");
      await invoke("scan_image_text", { id: null });
      setMessage(
        "Scan finished or stopped. Already scanned images are preserved.",
      );
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setStarting(false);
    }
  }
  return (
    <div className="setting-card">
      <h3>Image text search · Windows OCR</h3>
      <p>
        Scan copied images and screenshots using the installed Windows
        recognition language. Extracted text joins literal and fuzzy history
        search. Originals stay intact. Scanning runs one image at a time; stop
        takes effect after the current image (up to 40 seconds).
      </p>
      {status && (
        <p>
          {status.scanned} / {status.images} scanned · {status.failed}{" "}
          unavailable{status.running ? " · scanning" : ""}
        </p>
      )}
      <button
        className="secondary"
        disabled={!native || starting || status?.running}
        onClick={() => void start()}
      >
        Scan unprocessed images
      </button>
      <button
        className="secondary"
        disabled={!status?.running}
        onClick={() =>
          void invoke("cancel_ocr").catch((e) => setMessage(String(e)))
        }
      >
        Stop scan
      </button>
      <p>
        Newly copied images are scanned in the background. Catch-up scans
        process up to 25 unscanned images every two hours by default. Scanned,
        empty, and failed results are recorded across restarts, so they are not
        repeatedly processed. Failed images can be retried from their details.
        Pausing capture pauses catch-up scans. Turn off scanning newly copied
        images to disable that too.
      </p>
      <label>
        <input
          type="checkbox"
          checked={onCapture}
          onChange={(e) => setOnCapture(e.target.checked)}
        />
        Scan newly copied images
      </label>
      <label>
        Catch-up interval (seconds; 7200 = two hours, 0 disables catch-up)
        <input
          className="setting-input"
          type="number"
          min={0}
          max={86400}
          value={interval}
          onChange={(e) => setIntervalValue(Number(e.target.value))}
        />
      </label>
      <p>
        Stop ends the current scan. Set the interval to 0 to disable future
        catch-up scans. Turn off scanning newly copied images to disable that
        too.
      </p>
      <button
        className="secondary"
        disabled={!native}
        onClick={() =>
          void preferences()
            .then((p) =>
              savePreferences({
                ...p,
                ocrIntervalSeconds: interval,
                ocrOnCapture: onCapture,
              }),
            )
            .then(() => setMessage("OCR schedule saved"))
            .catch((e) => setMessage(String(e)))
        }
      >
        Save OCR schedule
      </button>
      {status?.error && <p role="alert">{status.error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function ImageText({ id }: { id: string }) {
  const [record, setRecord] = useState<Record | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let stop: UnlistenFn | undefined;
    setRecord(null);
    setError("");
    const refresh = () =>
      invoke<Record | null>("image_ocr_text", { id })
        .then((r) => {
          if (!disposed) setRecord(r);
        })
        .catch((e) => {
          if (!disposed) setError(String(e));
        });
    if (native) {
      void refresh();
      void listen("archive-changed", () => void refresh()).then((fn) => {
        if (disposed) fn();
        else stop = fn;
      });
    }
    return () => {
      disposed = true;
      stop?.();
    };
  }, [id]);
  async function scan() {
    setBusy(true);
    try {
      await invoke("scan_image_text", { id });
      setRecord(await invoke("image_ocr_text", { id }));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="image-text">
      <h4>Extracted image text</h4>
      <button
        className="secondary"
        disabled={!native || busy}
        onClick={() => void scan()}
      >
        {busy ? "Recognizing…" : record ? "Scan again" : "Extract text"}
      </button>
      {record?.text && (
        <>
          <small>{record.language}</small>
          <pre tabIndex={0}>{record.text}</pre>
          <button
            className="secondary"
            onClick={() =>
              void copy({ id } as Item, true, record.text).catch((e) =>
                setError(String(e)),
              )
            }
          >
            Copy extracted text
          </button>
        </>
      )}
      {record && !record.error && !record.text && <p>No text detected.</p>}
      {(error || record?.error) && <p role="alert">{error || record?.error}</p>}
    </section>
  );
}
