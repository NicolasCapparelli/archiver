import { emptySketch, parseSketch, SKETCH_LIMITS, validateSketch, type SketchDocument } from "./sketchpad-model.ts";

export const SKETCHBOOK_KEY = "archiver-sketchbook-v1";
export const LEGACY_SKETCH_KEY = "archiver-sketchpad-v1";
export const SKETCHBOOK_LIMIT = 50;
export type SavedSketch = { id: string; name: string; updatedAt: number; document: SketchDocument };
export type Sketchbook = { version: 1; sketches: SavedSketch[]; workspace: { savedId: string | null; name: string; document: SketchDocument } };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 128;
const validName = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 120;
export function emptySketchbook(document = emptySketch()): Sketchbook {
  return { version: 1, sketches: [], workspace: { savedId: null, name: "Untitled sketch", document } };
}
export function validateSketchbook(value: unknown): Sketchbook {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.sketches) || value.sketches.length > SKETCHBOOK_LIMIT || !record(value.workspace)) throw new Error("Unsupported sketchbook");
  const ids = new Set<string>();
  const sketches = value.sketches.map(raw => {
    if (!record(raw) || !validId(raw.id) || ids.has(raw.id) || !validName(raw.name) || typeof raw.updatedAt !== "number" || !Number.isSafeInteger(raw.updatedAt) || raw.updatedAt < 0 || raw.updatedAt > 8640000000000000) throw new Error("Invalid saved sketch");
    ids.add(raw.id);
    return { id: raw.id, name: raw.name, updatedAt: raw.updatedAt, document: validateSketch(raw.document) };
  });
  const w = value.workspace;
  if (!validName(w.name) || !(w.savedId === null || validId(w.savedId) && ids.has(w.savedId))) throw new Error("Invalid sketch workspace");
  return { version: 1, sketches, workspace: { savedId: w.savedId as string | null, name: w.name, document: validateSketch(w.document) } };
}
export function serializeSketchbook(book: Sketchbook): string {
  const source = JSON.stringify(validateSketchbook(book));
  if (new TextEncoder().encode(source).byteLength > SKETCH_LIMITS.bytes) throw new Error("Sketchbook storage limit reached. Delete unused saved sketches before saving more.");
  return source;
}
export function loadSketchbook(storage: Pick<Storage, "getItem">): { book: Sketchbook; error: string; blocked: boolean } {
  try {
    const source = storage.getItem(SKETCHBOOK_KEY);
    if (source !== null) {
      if (source.length > SKETCH_LIMITS.bytes || new TextEncoder().encode(source).byteLength > SKETCH_LIMITS.bytes) throw new Error("Sketchbook exceeds the storage limit");
      return { book: validateSketchbook(JSON.parse(source)), error: "", blocked: false };
    }
    const legacy = storage.getItem(LEGACY_SKETCH_KEY);
    return { book: emptySketchbook(legacy ? parseSketch(legacy) : emptySketch()), error: "", blocked: false };
  } catch (error) {
    // Never overwrite a saved collection that cannot be recovered.
    return { book: emptySketchbook(), error: `Sketch recovery failed: ${String(error)}. Stored data is unchanged. Saving is blocked until recovery is repaired.`, blocked: true };
  }
}
export function writeSketchbook(storage: Pick<Storage, "setItem">, book: Sketchbook) {
  // One atomic storage write holds both the named snapshots and working draft.
  storage.setItem(SKETCHBOOK_KEY, serializeSketchbook(book));
}
export function sketchIsDirty(book: Sketchbook, document: SketchDocument, name: string) {
  const saved = book.sketches.find(s => s.id === book.workspace.savedId);
  return saved ? name.trim() !== saved.name || JSON.stringify(validateSketch(document)) !== JSON.stringify(saved.document) : document.objects.length > 0;
}
export function saveNamedSketch(book: Sketchbook, document: SketchDocument, name: string, id: string, now: number): Sketchbook {
  const savedId = book.workspace.savedId ?? id;
  const existing = book.sketches.some(s => s.id === savedId);
  if (existing && book.workspace.savedId === null) throw new Error("Sketch identity already exists. Retry saving.");
  if (!existing && book.sketches.length >= SKETCHBOOK_LIMIT) throw new Error(`You can keep up to ${SKETCHBOOK_LIMIT} saved sketches. Delete a sketch before saving another.`);
  const saved: SavedSketch = { id: savedId, name: name.trim() || "Untitled sketch", updatedAt: now, document };
  return validateSketchbook({ version: 1, sketches: existing ? book.sketches.map(s => s.id === savedId ? saved : s) : [...book.sketches, saved], workspace: { savedId, name: saved.name, document } });
}
export function openNamedSketch(book: Sketchbook, id: string): Sketchbook {
  const saved = book.sketches.find(s => s.id === id);
  if (!saved) throw new Error("Saved sketch no longer exists");
  return validateSketchbook({ ...book, workspace: { savedId: id, name: saved.name, document: saved.document } });
}
export function removeNamedSketch(book: Sketchbook, id: string): Sketchbook {
  return validateSketchbook({ ...book, sketches: book.sketches.filter(s => s.id !== id), workspace: { ...book.workspace, savedId: book.workspace.savedId === id ? null : book.workspace.savedId } });
}
