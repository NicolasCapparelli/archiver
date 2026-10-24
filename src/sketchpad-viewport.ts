import type { Point } from "./sketchpad-model.ts";
export type SketchView = { x: number; y: number; scale: number };
export type SketchBounds = { x: number; y: number; width: number; height: number };
export function fitSketch(width: number, height: number, bounds: SketchBounds = { x: 0, y: 0, width: 1200, height: 800 }): SketchView {
  const w = Math.max(8, bounds.width), h = Math.max(8, bounds.height);
  const scale = Math.max(.001, Math.min(8, Math.max(1, width - 64) / w, Math.max(1, height - 64) / h));
  return { x: width / 2 - (bounds.x + bounds.width / 2) * scale, y: height / 2 - (bounds.y + bounds.height / 2) * scale, scale };
}
export function viewPoint(point: Point, view: SketchView): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
/** Keep the artwork under the pointer stationary while zooming. */
export function zoomSketch(view: SketchView, anchor: Point, factor: number): SketchView {
  const scale = Math.max(.001, Math.min(8, view.scale * factor));
  const point = viewPoint(anchor, view);
  return { scale, x: anchor.x - point.x * scale, y: anchor.y - point.y * scale };
}
