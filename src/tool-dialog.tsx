import { useEffect, useRef, type ReactNode } from "react";
export function ToolDialog({
  title,
  onClose,
  children,
  tall,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`edit-dialog tool-dialog ${tall ? "tall" : ""} ${className}`}
      aria-label={title}
      onClose={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header>
        <h2>{title}</h2>
        {new URLSearchParams(location.search).has("quick") ? <span className="esc-hint"><kbd>Esc</kbd> close</span> : <button className="secondary" onClick={() => ref.current?.close()}>Close</button>}
      </header>
      {children}
    </dialog>
  );
}
