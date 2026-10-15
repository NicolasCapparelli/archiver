import { useMemo } from "react";
import { diffLines } from "./text-diff";
import type { Item } from "./api";
export function DiffViewer({ before, after }: { before: Item; after: Item }) {
  const result = useMemo(() => {
    try {
      return diffLines(before.text, after.text);
    } catch (error) {
      return String(error);
    }
  }, [before.text, after.text]);
  return (
    <details className="text-diff">
      <summary>Compare first two selections</summary>
      <p>
        − {before.name || before.text.slice(0, 50)}
        <br />+ {after.name || after.text.slice(0, 50)}
      </p>
      {typeof result === "string" ? (
        <p role="status">{result}</p>
      ) : (
        <>
          {result.coarse && (
            <p>
              Large comparison: unchanged prefix and suffix are preserved; the
              middle is shown as a replacement.
            </p>
          )}
          <pre tabIndex={0} aria-label="Text comparison">
            {result.lines.map((line, index) => (
              <span key={index} className={`diff-${line.kind}`}>
                {line.kind === "add"
                  ? "+ "
                  : line.kind === "remove"
                    ? "− "
                    : "  "}
                {line.text}
                {!line.text.endsWith("\n") && "\n[No final newline]\n"}
              </span>
            ))}
          </pre>
        </>
      )}
    </details>
  );
}
