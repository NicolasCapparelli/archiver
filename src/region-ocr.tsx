import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";
import { ToolDialog } from "./tool-dialog";

type Rect = { x: number; y: number; width: number; height: number };
export function RegionOcr({ id, onClose }: { id: string; onClose: () => void }) {
  const [image, setImage] = useState<api.ImagePreview>();
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let disposed = false;
    void api.imagePreview(id, false).then(value => {
      if (!disposed) { setImage(value); setRect({ x: 0, y: 0, width: value.width, height: value.height }); }
    }).catch(error => { if (!disposed) setMessage(String(error)); });
    return () => { disposed = true; };
  }, [id]);
  async function scan() {
    if (!image || busy) return;
    setBusy(true); setText(""); setMessage("");
    try {
      const result = await invoke<{ text: string; error: string }>("recognize_image_region", {
        id, region: { x: rect.x / image.width, y: rect.y / image.height, width: rect.width / image.width, height: rect.height / image.height },
      });
      setText(result.text); setMessage(result.error || (result.text ? "Region recognized. Original image and full-image OCR unchanged." : "No text detected in this region."));
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  return <ToolDialog title="Region OCR" onClose={onClose} tall>
    <p>Drag over the image or enter a rectangle in original image pixels. Recognition uses installed Windows OCR languages.</p>
    {!image && !message && <p role="status">Loading image…</p>}
    {image && <>
      <div className="region-image" style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerDown={event => {
          if (busy || event.button !== 0) return;
          const box = event.currentTarget.getBoundingClientRect();
          start.current = { x: Math.floor((event.clientX - box.left) / box.width * image.width), y: Math.floor((event.clientY - box.top) / box.height * image.height) };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!start.current || busy) return;
          const box = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(image.width, Math.round((event.clientX - box.left) / box.width * image.width)));
          const y = Math.max(0, Math.min(image.height, Math.round((event.clientY - box.top) / box.height * image.height)));
          setRect({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: Math.max(1, Math.abs(x - start.current.x)), height: Math.max(1, Math.abs(y - start.current.y)) });
          setText(""); setMessage("");
        }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        <img draggable={false} src={image.url} alt="Choose a rectangle for OCR using drag or the pixel fields below" />
        <span className="region-selection" style={{ left: `${rect.x / image.width * 100}%`, top: `${rect.y / image.height * 100}%`, width: `${rect.width / image.width * 100}%`, height: `${rect.height / image.height * 100}%` }} />
      </div>
      <div className="region-fields">{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key}
        <input type="number" min={key === "width" || key === "height" ? 1 : 0} max={key === "x" || key === "width" ? image.width : image.height} value={rect[key]} disabled={busy}
          onChange={event => { setRect({ ...rect, [key]: Number(event.target.value) }); setText(""); setMessage(""); }} />
      </label>)}</div>
      <button className="primary" disabled={!api.native || busy || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0 || rect.x + rect.width > image.width || rect.y + rect.height > image.height} onClick={() => void scan()}>{busy ? "Recognizing…" : "Recognize region"}</button>
    </>}
    {text && <><textarea className="tool-text mono" readOnly aria-label="Region OCR result" value={text} /><button className="secondary" onClick={() => void navigator.clipboard.writeText(text).then(() => setMessage("Region text copied")).catch(error => setMessage(String(error)))}>Copy region text</button></>}
    {message && <p role="status">{message}</p>}
    {!api.native && <p>Recognition requires the Windows desktop app.</p>}
  </ToolDialog>;
}
