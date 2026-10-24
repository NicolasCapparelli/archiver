import { shapeBox, validateSketch, type SketchDocument } from "./sketchpad-model.ts";
import { textLines } from "./sketchpad-text";
export async function sketchPng(document: SketchDocument): Promise<Blob> {
  const scene = validateSketch(document);
  await documentFonts();
  const canvas = window.document.createElement("canvas"); canvas.width = scene.width; canvas.height = scene.height;
  const c = canvas.getContext("2d"); if (!c) throw new Error("Image rendering is unavailable");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, canvas.width, canvas.height);
  for (const o of scene.objects) {
    c.strokeStyle = o.style.stroke; c.fillStyle = o.style.fill ?? o.style.stroke;
    c.lineWidth = o.style.width; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
    if (o.kind === "text") {
      c.fillStyle = o.style.stroke; c.font = `${o.fontSize}px "DM Sans"`; c.textBaseline = "top";
      textLines(o).forEach((line, i) => c.fillText(line, o.position.x, o.position.y + i * o.fontSize * 1.25)); continue;
    }
    if (o.kind === "stroke") {
      o.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      if (o.points.length === 1) { c.arc(o.points[0].x, o.points[0].y, o.style.width / 2, 0, Math.PI * 2); c.fillStyle = o.style.stroke; c.fill(); continue; }
    } else if (o.kind === "line") { c.moveTo(o.start.x, o.start.y); c.lineTo(o.end.x, o.end.y); }
    else {
      const b = shapeBox(o.start, o.end);
      if (o.kind === "rectangle") c.rect(b.x, b.y, b.width, b.height);
      else c.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
      if (o.style.fill) c.fill();
    }
    c.stroke();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png"));
}
async function documentFonts() { await document.fonts.load('16px "DM Sans"'); await document.fonts.ready; }
