type ShortcutEvent = { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; code: string };
/** Librarian-local opening chord. Do not consume related modified shortcuts. */
export function isSketchpadShortcut(event: ShortcutEvent): boolean {
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyD";
}
