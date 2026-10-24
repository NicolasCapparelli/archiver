import type { SketchObject } from "./sketchpad-model.ts";
export type SketchText = Extract<SketchObject, { kind: "text" }>;
let context: CanvasRenderingContext2D | null | undefined;
export function textLines(object: SketchText, measure?: (text: string) => number): string[] {
  if (!object.box) return object.text.split("\n");
  if (!measure) {
    if (context === undefined) context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (context) context.font = `${object.fontSize}px "DM Sans"`;
    measure = context ? text => context!.measureText(text).width : text => text.length * object.fontSize * .65;
  }
  const lines: string[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const paragraph of object.text.split("\n")) {
    const glyphs = [...segmenter.segment(paragraph)].map(part => part.segment);
    let start = 0;
    while (start < glyphs.length) {
      // Find a fitting prefix without splitting emoji or combining characters.
      let low = start + 1, high = glyphs.length, end = start;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (measure(glyphs.slice(start, mid).join("")) <= object.box.width) { end = mid; low = mid + 1; }
        else high = mid - 1;
      }
      end = Math.max(start + 1, end);
      if (end === glyphs.length) { lines.push(glyphs.slice(start).join("")); start = end; break; }
      let space = end;
      while (space > start && glyphs[space] !== " ") space--;
      const split = space > start ? space : end;
      lines.push(glyphs.slice(start, split).join(""));
      start = split + (space > start ? 1 : 0);
    }
    if (!glyphs.length) lines.push("");
  }
  return lines;
}
