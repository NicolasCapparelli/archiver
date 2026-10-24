import { shapeBox, type Point, type SketchObject } from "./sketchpad-model.ts";
import { textLines } from "./sketchpad-text.ts";
export function objectBox(o: SketchObject) {
  if (o.kind === "stroke") {
    let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
    for (const p of o.points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
    return { x, y, width: right - x, height: bottom - y };
  }
  if (o.kind === "text") return { x: o.position.x, y: o.position.y, width: o.box?.width ?? Math.max(...o.text.split("\n").map(s => s.length), 1) * o.fontSize * .65, height: Math.max(o.box?.height ?? 0, textLines(o).length * o.fontSize * 1.25) };
  return shapeBox(o.start, o.end);
}
export function artworkBox(objects: SketchObject[]) {
  if (!objects.length) return undefined;
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const object of objects) {
    const box = objectBox(object), edge = object.style.width / 2;
    x = Math.min(x, box.x - edge); y = Math.min(y, box.y - edge);
    right = Math.max(right, box.x + box.width + edge); bottom = Math.max(bottom, box.y + box.height + edge);
  }
  return { x, y, width: right - x, height: bottom - y };
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitObject(o: SketchObject, p: Point, tolerance: number) {
  const t = tolerance + o.style.width / 2;
  if (o.kind === "line") return segmentDistance(p, o.start, o.end) <= t;
  if (o.kind === "stroke") return o.points.some((a, i) => segmentDistance(p, a, o.points[Math.max(0, i - 1)]) <= t);
  const b = objectBox(o), inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  if (o.kind === "text") return inside;
  if (o.kind === "ellipse") {
    const rx = b.width / 2, ry = b.height / 2;
    if (!rx || !ry) return segmentDistance(p, o.start, o.end) <= t;
    const r = Math.hypot((p.x - b.x - rx) / rx, (p.y - b.y - ry) / ry);
    return o.style.fill ? r <= 1 + t / Math.min(rx, ry) : Math.abs(r - 1) <= t / Math.min(rx, ry);
  }
  if (o.style.fill && inside) return true;
  const a = { x: b.x, y: b.y }, c = { x: b.x + b.width, y: b.y + b.height };
  return [[a, { x: c.x, y: a.y }], [{ x: c.x, y: a.y }, c], [c, { x: a.x, y: c.y }], [{ x: a.x, y: c.y }, a]].some(([u, v]) => segmentDistance(p, u, v) <= t);
}
export function moveObject(o: SketchObject, dx: number, dy: number): SketchObject {
  const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  if (o.kind === "stroke") return { ...o, points: o.points.map(move) };
  if (o.kind === "text") return { ...o, position: move(o.position) };
  return { ...o, start: move(o.start), end: move(o.end) };
}
