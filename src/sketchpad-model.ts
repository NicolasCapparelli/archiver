export const SKETCH_LIMITS = Object.freeze({ objects: 1000, points: 100_000, text: 10_000, bytes: 16 * 1024 * 1024, history: 100 });
export type Point = { x: number; y: number };
export type SketchStyle = { stroke: string; width: number; fill: string | null };
type Base = { id: string; style: SketchStyle };
export type SketchObject = Base & (
  | { kind: "stroke"; points: Point[] }
  | { kind: "line" | "rectangle" | "ellipse"; start: Point; end: Point }
  | { kind: "text"; position: Point; text: string; fontSize: number; box?: { width: number; height: number } }
);
export type SketchDocument = { version: 1; width: 1200; height: 800; objects: SketchObject[] };
export type SketchCommand = { kind: "replace"; objects: SketchObject[] };
export const emptySketch = (): SketchDocument => ({ version: 1, width: 1200, height: 800, objects: [] });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const point = (value: unknown): value is Point => record(value) && finite(value.x) && finite(value.y) && Math.abs(value.x) <= 100_000 && Math.abs(value.y) <= 100_000;
const color = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** Validate and copy untrusted recovery data. Never return aliases into the input. */
export function validateSketch(value: unknown): SketchDocument {
  if (!record(value) || value.version !== 1 || value.width !== 1200 || value.height !== 800 || !Array.isArray(value.objects)) throw new Error("Unsupported sketch document");
  if (value.objects.length > SKETCH_LIMITS.objects) throw new Error("Sketch object limit reached");
  let points = 0, characters = 0;
  const ids = new Set<string>();
  const objects: SketchObject[] = value.objects.map(raw => {
    if (!record(raw) || typeof raw.id !== "string" || !raw.id || raw.id.length > 128 || ids.has(raw.id)) throw new Error("Invalid sketch object ID");
    ids.add(raw.id);
    const style = raw.style;
    if (!record(style) || !color(style.stroke) || !finite(style.width) || style.width < 1 || style.width > 32 || !(style.fill === null || color(style.fill))) throw new Error("Invalid sketch style");
    const base: Base = { id: raw.id, style: { stroke: style.stroke, width: style.width, fill: style.fill } };
    if (raw.kind === "stroke") {
      if (!Array.isArray(raw.points) || !raw.points.length) throw new Error("Invalid stroke");
      points += raw.points.length;
      if (points > SKETCH_LIMITS.points || !raw.points.every(point)) throw new Error("Invalid or oversized stroke");
      return { ...base, kind: "stroke", points: raw.points.map(p => ({ x: p.x, y: p.y })) };
    }
    if (raw.kind === "text") {
      if (!point(raw.position) || typeof raw.text !== "string" || !finite(raw.fontSize) || raw.fontSize < 8 || raw.fontSize > 144) throw new Error("Invalid sketch text");
      characters += raw.text.length;
      if (characters > SKETCH_LIMITS.text) throw new Error("Sketch text limit reached");
      if (raw.box !== undefined && (!record(raw.box) || !finite(raw.box.width) || !finite(raw.box.height) || raw.box.width < 1 || raw.box.height < 1 || raw.box.width > 100_000 || raw.box.height > 100_000)) throw new Error("Invalid text box");
      const box = record(raw.box) ? { width: raw.box.width as number, height: raw.box.height as number } : undefined;
      return { ...base, kind: "text", position: { ...raw.position }, text: raw.text, fontSize: raw.fontSize, ...(box ? { box } : {}) };
    }
    if ((raw.kind === "line" || raw.kind === "rectangle" || raw.kind === "ellipse") && point(raw.start) && point(raw.end)) return { ...base, kind: raw.kind, start: { ...raw.start }, end: { ...raw.end } };
    throw new Error("Invalid sketch geometry");
  });
  const result: SketchDocument = { version: 1, width: 1200, height: 800, objects };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > SKETCH_LIMITS.bytes) throw new Error("Sketch storage limit reached");
  return result;
}

export function parseSketch(source: string): SketchDocument {
  if (source.length > SKETCH_LIMITS.bytes || new TextEncoder().encode(source).byteLength > SKETCH_LIMITS.bytes) throw new Error("Sketch storage limit reached");
  return validateSketch(JSON.parse(source));
}

export function applySketchCommand(document: SketchDocument, command: SketchCommand): SketchDocument {
  return validateSketch({ ...document, objects: command.objects });
}

/** The viewport must be the actual fitted artwork rectangle, without letterbox margins. */
export function sketchPoint(client: Point, viewport: { left: number; top: number; width: number; height: number }): Point {
  if (!finite(client.x) || !finite(client.y) || ![viewport.left, viewport.top, viewport.width, viewport.height].every(finite) || viewport.width <= 0 || viewport.height <= 0) throw new Error("Invalid sketch viewport");
  return { x: Math.max(0, Math.min(1200, (client.x - viewport.left) * 1200 / viewport.width)), y: Math.max(0, Math.min(800, (client.y - viewport.top) * 800 / viewport.height)) };
}

export function strictEnd(start: Point, end: Point, kind: "line" | "rectangle" | "ellipse", constrained: boolean): Point {
  if (!constrained) return { ...end };
  const dx = end.x - start.x, dy = end.y - start.y;
  if (kind === "line") {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    const length = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
}

export function shapeBox(start: Point, end: Point) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
