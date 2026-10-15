import { useEffect, useRef, useState } from "react";
import { ToolDialog } from "./tool-dialog";

export type Choice = { id: string; label: string };
/** Small arrow-key list dialog: ↑/↓ choose, Enter applies, Esc cancels. */
export function ChoiceDialog({
  title,
  hint,
  choices,
  initial = 0,
  onChoose,
  onClose,
}: {
  title: string;
  hint?: string;
  choices: Choice[];
  initial?: number;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (list.current?.children[initial] as HTMLElement | undefined)?.focus();
  }, [initial]);
  return (
    <ToolDialog title={title} onClose={onClose}>
      <p>{hint ?? "↑ / ↓ choose · Enter applies · Esc cancels"}</p>
      <div
        className="transform-options"
        ref={list}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            const next =
              (index + (e.key === "ArrowDown" ? 1 : -1) + choices.length) %
              choices.length;
            setIndex(next);
            (list.current?.children[next] as HTMLElement)?.focus();
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onChoose(choices[index].id);
          }
        }}
      >
        {choices.map((choice, i) => (
          <button
            key={choice.id}
            data-initial-focus={i === initial ? "true" : undefined}
            className={`palette-action ${index === i ? "selected" : ""}`}
            onFocus={() => setIndex(i)}
            onClick={() => onChoose(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </ToolDialog>
  );
}
