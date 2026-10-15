import { useMemo, useState } from "react";
import { highlight } from "./highlight-engine";
const languages = [
  "powershell",
  "dos",
  "bash",
  "json",
  "sql",
  "javascript",
  "typescript",
  "python",
  "rust",
  "xml",
];
export default function Highlight({
  text,
  kind,
  source,
}: {
  text: string;
  kind: string;
  source: string;
}) {
  const [choice, setChoice] = useState("auto");
  // Synchronous: the preview is capped at 30,000 characters, and a module worker
  // is not reliably available under the packaged app's CSP.
  const result = useMemo(() => {
    try {
      return highlight(text, kind, source, choice);
    } catch {
      return null;
    }
  }, [text, kind, source, choice]);
  return (
    <div className="syntax-preview">
      <label>
        Language{" "}
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          aria-label="Preview language"
        >
          <option value="auto">
            Auto · {result?.language || "Plain text"}
          </option>
          <option value="plain">Plain text</option>
          {languages.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <pre className="content-preview mono">
        {result ? (
          <code dangerouslySetInnerHTML={{ __html: result.value }} />
        ) : (
          <code>{text.slice(0, 30000)}</code>
        )}
      </pre>
      {text.length > 30000 && (
        <small>
          Preview limited to 30,000 characters. Copy uses the full content.
        </small>
      )}
    </div>
  );
}
