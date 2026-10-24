import { SKETCH_LIMITS, validateSketch, type SketchDocument } from "./sketchpad-model.ts";
export type SketchHistory = { past: SketchDocument[]; present: SketchDocument; future: SketchDocument[] };
export function sketchHistory(document: SketchDocument): SketchHistory { return { past: [], present: validateSketch(document), future: [] }; }
function bounded(documents: SketchDocument[]) {
  let bytes = 0;
  return documents.slice(-SKETCH_LIMITS.history).reverse().filter(document => {
    bytes += new TextEncoder().encode(JSON.stringify(document)).byteLength;
    return bytes <= SKETCH_LIMITS.bytes;
  }).reverse();
}
export function commitSketch(history: SketchHistory, next: SketchDocument): SketchHistory {
  const document = validateSketch(next);
  if (JSON.stringify(document) === JSON.stringify(history.present)) return history;
  return { past: bounded([...history.past, history.present]), present: document, future: [] };
}
export function undoSketch(h: SketchHistory): SketchHistory {
  return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
}
export function redoSketch(h: SketchHistory): SketchHistory {
  return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
}
