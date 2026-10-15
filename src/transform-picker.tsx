import { useEffect, useRef, useState } from "react";
import { ToolDialog } from "./tool-dialog";
import { transform, type Transformation } from "./text-tools";
const transforms: [Transformation | "highlight", string][] = [
  ["json", "Format JSON"],
  ["trim", "Trim whitespace"],
  ["upper", "UPPERCASE"],
  ["lower", "lowercase"],
  ["url", "Decode URL escapes"],
  ["highlight", "Syntax highlighting (opens full clip)"],
];
export function TransformPicker({
  text,
  onCopy,
  onHighlight,
  onClose,
}: {
  onHighlight: () => void;
  text: string;
  onCopy: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!busy)
      (options.current?.children[index] as HTMLElement | undefined)?.focus();
  }, [busy]);
  async function copy(i: number) {
    if (busy) return;
    const kind = transforms[i][0];
    if (kind === "highlight") {
      onHighlight();
      return;
    }
    setBusy(true);
    try {
      await onCopy(transform(text, kind));
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ToolDialog title="Transform & copy" onClose={onClose}>
      <p>↑ / ↓ choose · Enter copies. Original history is preserved.</p>
      <div
        className="transform-options"
        ref={options}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            const next =
              (index + (e.key === "ArrowDown" ? 1 : -1) + transforms.length) %
              transforms.length;
            setIndex(next);
            (e.currentTarget.children[next] as HTMLElement)?.focus();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            void copy(index);
          }
        }}
      >
        {transforms.map(([kind, label], i) => (
          <button
            autoFocus={i === 0}
            data-initial-focus={i === 0 ? "true" : undefined}
            key={kind}
            className={`palette-action ${index === i ? "selected" : ""}`}
            disabled={busy}
            onFocus={() => setIndex(i)}
            onClick={() => void copy(i)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </ToolDialog>
  );
}
