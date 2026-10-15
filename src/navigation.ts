export function nextIndex(
  index: number,
  delta: number,
  length: number,
  wrap = false,
) {
  if (!length) return -1;
  return wrap
    ? (index + delta + length) % length
    : Math.max(0, Math.min(length - 1, index + delta));
}
export function navigationKey(event: { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }, quick: boolean, editing: boolean) {
  if (!quick || editing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return event.key;
  return ({ KeyW: "ArrowUp", KeyS: "ArrowDown", KeyA: "ArrowLeft", KeyD: "ArrowRight" } as Record<string, string>)[event.code] || event.key;
}
export function isArchivistShortcut(event: { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }) {
  return event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && (event.code === "KeyO" || event.key.toLowerCase() === "o");
}
export function shortcutFromKey(event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}) {
  if (/^(Control|Alt|Shift|Meta)/.test(event.code)) return null;
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
  ].filter(Boolean);
  return modifiers.length ? [...modifiers, event.code].join("+") : null;
}
export function shortcutLabel(shortcut: string) {
  return shortcut
    .replace(/Super/g, navigator.platform.includes("Mac") ? "Cmd" : "Win")
    .replace(/Period/g, ".")
    .replace(/Key([A-Z])/g, "$1")
    .replace(/Digit(\d)/g, "$1")
    .replace(/\+/g, " + ");
}
