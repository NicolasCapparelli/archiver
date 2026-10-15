import { useState, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native, type Item } from "./api";
const Highlight = lazy(() => import("./highlight"));
function urlOf(text: string) {
  try {
    const u = new URL(text.trim());
    return ["http:", "https:"].includes(u.protocol) ? u : undefined;
  } catch {
    return undefined;
  }
}
export function ResourcePreview({ item }: { item: Item }) {
  const url = urlOf(item.text),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [content, setContent] = useState<{
      path: string;
      text?: string;
      truncated?: boolean;
      image?: { url: string; width: number; height: number };
    }>(),
    [files, setFiles] = useState<
      {
        path: string;
        available: boolean;
        directory?: boolean;
        bytes?: number;
        error?: string;
        modified?: number;
      }[]
    >([]);
  useEffect(() => {
    let live = true;
    setTitle("");
    setFiles([]);
    setContent(undefined);
    setError("");
    if (native && url)
      invoke<string>("url_preview", { id: item.id, fetch: false })
        .then((t) => {
          if (live) setTitle(t);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [item.id]);
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (!native) throw Error("Previews require the desktop archive");
      if (url)
        setTitle(await invoke("url_preview", { id: item.id, fetch: true }));
      else setFiles(await invoke("file_preview", { id: item.id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!url && item.kind !== "files") return null;
  return (
    <section className="resource-preview">
      <h4>{url ? url.hostname : "Copied files"}</h4>
      {title && <p>{title}</p>}
      <p>
        {url
          ? "Fetching a title contacts this URL and follows up to three redirects. Pages are never rendered."
          : "Checks current paths and metadata. Moved files remain recorded under their original paths."}
      </p>
      <button className="secondary" disabled={busy} onClick={() => void load()}>
        {url
          ? title
            ? "Refresh page title"
            : "Fetch page title"
          : "Check file availability"}
      </button>
      {files.map((file, index) => (
        <article key={index}>
          <strong className="mono">{file.path}</strong>
          <p>
            {file.available
              ? `${file.directory ? "Directory" : "File"} · ${file.bytes} bytes`
              : `Unavailable · ${file.error}`}
          </p>
          {file.modified && (
            <small>Modified {new Date(file.modified).toLocaleString()}</small>
          )}
          {file.available && !file.directory && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await invoke<object>("file_content_preview", {
                    id: item.id,
                    path: file.path,
                  });
                  setContent({ path: file.path, ...result });
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Preview file contents
            </button>
          )}
          {content?.path === file.path && (
            <>
              {content.image && (
                <img
                  src={content.image.url}
                  alt={file.path}
                  width={Math.min(256, content.image.width)}
                />
              )}
              {content.text !== undefined && (
                <Suspense fallback={<pre>{content.text.slice(0, 30000)}</pre>}>
                  <Highlight
                    text={content.text}
                    kind="text"
                    source={file.path}
                  />
                </Suspense>
              )}
              {content.truncated && (
                <small>Preview limited to the first 64 KB.</small>
              )}
            </>
          )}
        </article>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
export function DomainGroups({
  onSelect,
}: {
  onSelect: (domain: string) => void;
}) {
  const [domains, setDomains] = useState<[string, number][]>([]);
  useEffect(() => {
    if (native)
      invoke<[string, number][]>("link_domains")
        .then(setDomains)
        .catch(() => {});
  }, []);
  return (
    <details className="domain-groups">
      <summary>Browse URL domains</summary>
      {domains.map(([domain, count]) => (
        <button
          className="secondary"
          key={domain}
          onClick={() => onSelect(domain)}
        >
          {domain} · {count}
        </button>
      ))}
      {!domains.length && <p>No captured URLs yet.</p>}
    </details>
  );
}
