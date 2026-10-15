import { OcrMatch } from "./ocr-match";
import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { ImageText } from "./ocr-tools";
const cache = new Map<string, Promise<api.ImagePreview>>();
function thumbnail(id: string) {
  if (!cache.has(id)) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(id, api.imagePreview(id));
  }
  return cache.get(id)!;
}
export function ImageThumbnail({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<api.ImagePreview>();
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void thumbnail(id).then(
          (value) => {
            if (!disposed) setPreview(value);
          },
          (error) => {
            if (!disposed) setError(String(error));
          },
        );
      },
      { rootMargin: "100px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [id]);
  return (
    <span
      ref={ref}
      className="image-thumbnail"
      title={
        error ||
        (preview ? `${preview.width} × ${preview.height}` : "Loading image")
      }
    >
      {preview ? (
        <img src={preview.url} alt="Copied image thumbnail" />
      ) : error ? (
        "!"
      ) : (
        "…"
      )}
    </span>
  );
}
export function ImageDetail({ id, match }: { id: string; match?: api.Item["ocrMatch"] }) {
  const [preview, setPreview] = useState<api.ImagePreview>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState<api.ImagePreview>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let disposed = false;
    setPreview(undefined);
    setFull(undefined);
    setError("");
    void thumbnail(id).then(
      (value) => {
        if (!disposed) setPreview(value);
      },
      (error) => {
        if (!disposed) setError(String(error));
      },
    );
    return () => {
      disposed = true;
    };
  }, [id]);
  useEffect(() => {
    if (full) dialog.current?.showModal();
  }, [full]);
  async function open() {
    setLoading(true);
    try {
      setFull(await api.imagePreview(id, false));
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="image-detail">
      {preview && (
        <>
          <button
            className="image-open"
            onClick={() => void open()}
            disabled={loading}
            aria-label="Open full-size image"
          >
            <img src={preview.url} alt="Copied image" />
          </button>
          <p>
            {preview.width} × {preview.height} ·{" "}
            {loading ? "Opening…" : "Click for full size"}
          </p>
        </>
      )}
      {error && <p role="alert">Preview unavailable: {error}</p>}
      {!preview && !error && <p>Loading preview…</p>}
      {match && <OcrMatch match={match} />}
      <ImageText key={id} id={id} />
      <dialog
        ref={dialog}
        className="image-dialog"
        onClose={() => setFull(undefined)}
      >
        <div>
          <span>
            {full?.width} × {full?.height}
          </span>
          <button autoFocus onClick={() => dialog.current?.close()}>
            Close <kbd>Esc</kbd>
          </button>
        </div>
        {full && (
          <img
            src={full.url}
            alt="Full-size copied image"
            style={{ width: full.width, height: full.height }}
          />
        )}
      </dialog>
    </div>
  );
}
