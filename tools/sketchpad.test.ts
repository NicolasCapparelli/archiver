import { isSketchpadShortcut } from "../src/sketchpad-shortcuts.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { emptySketch, validateSketch, parseSketch, applySketchCommand, sketchPoint, strictEnd, shapeBox, SKETCH_LIMITS, type SketchObject } from "../src/sketchpad-model.ts";
import { sketchHistory, commitSketch, undoSketch, redoSketch } from "../src/sketchpad-history.ts";
import { hitObject, objectBox, moveObject, artworkBox } from "../src/sketchpad-geometry.ts";
import { fitSketch, viewPoint, zoomSketch } from "../src/sketchpad-viewport.ts";
import { textLines, type SketchText } from "../src/sketchpad-text.ts";
import { emptySketchbook, saveNamedSketch, openNamedSketch, removeNamedSketch, loadSketchbook, writeSketchbook, serializeSketchbook, validateSketchbook, sketchIsDirty, SKETCHBOOK_KEY, LEGACY_SKETCH_KEY, SKETCHBOOK_LIMIT } from "../src/sketchpad-storage.ts";
const line: SketchObject = { id: "a", kind: "line", start: { x: 30, y: 40 }, end: { x: 10, y: 20 }, style: { stroke: "#112233", fill: null, width: 2 } };

test("fit leaves margins on all sides in wide and tall workspaces", () => {
  for (const size of [{ width: 1000, height: 550 }, { width: 500, height: 800 }]) {
    const view = fitSketch(size.width, size.height);
    assert.ok(view.x >= 31.999 && view.y >= 31.999);
    assert.ok(view.x + 1200 * view.scale <= size.width - 31.999);
    assert.ok(view.y + 800 * view.scale <= size.height - 31.999);
    assert.deepEqual(viewPoint({ x: view.x, y: view.y }, view), { x: 0, y: 0 });
  }
});

test("zoom anchors the pointer, clamps scale, and keeps pan independent of document coordinates", () => {
  const view = { x: -140, y: 50, scale: .75 }, anchor = { x: 300, y: 180 };
  const before = viewPoint(anchor, view);
  for (const factor of [1.5, .01, 100]) {
    const zoomed = zoomSketch(view, anchor, factor), after = viewPoint(anchor, zoomed);
    assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
    assert.ok(zoomed.scale >= .001 && zoomed.scale <= 8);
  }
  assert.deepEqual(viewPoint({ x: 45, y: 80 }, { x: 20, y: 30, scale: .5 }), { x: 50, y: 100 });
});

test("text boxes wrap words and long tokens and preserve old drafts", () => {
  const text: SketchText = { id: "text", style: line.style, kind: "text", position: { x: 10, y: 20 }, text: "hello world\nabcdefghij\n", fontSize: 16, box: { width: 5, height: 25 } };
  assert.deepEqual(textLines(text, value => value.length), ["hello", "world", "abcde", "fghij", ""]);
  const doc = validateSketch({ ...emptySketch(), objects: [text] });
  assert.deepEqual(doc.objects[0], text);
  assert.equal(objectBox(text).width, 5);
  assert.ok(objectBox(text).height >= text.box!.height);
  const legacy = { ...text, box: undefined };
  assert.deepEqual(textLines(legacy), legacy.text.split("\n"));
  assert.doesNotThrow(() => validateSketch({ ...emptySketch(), objects: [legacy] }));
  assert.throws(() => validateSketch({ ...emptySketch(), objects: [{ ...text, box: { width: NaN, height: 20 } }] }));
  assert.throws(() => validateSketch({ ...emptySketch(), objects: [{ ...text, box: { width: 0, height: 20 } }] }));
});
test("fitted coordinates support scaling, offsets, and pointer capture outside the canvas", () => {
  assert.deepEqual(sketchPoint({ x: 310, y: 220 }, { left: 10, top: 20, width: 600, height: 400 }), { x: 600, y: 400 });
  assert.deepEqual(sketchPoint({ x: -20, y: 900 }, { left: 0, top: 0, width: 600, height: 400 }), { x: 0, y: 800 });
  assert.throws(() => sketchPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 1 }));
});
test("reverse shapes normalize and constraints preserve the drag quadrant", () => {
  assert.deepEqual(shapeBox(line.start, line.end), { x: 10, y: 20, width: 20, height: 20 });
  assert.deepEqual(strictEnd({ x: 100, y: 100 }, { x: 80, y: 50 }, "ellipse", true), { x: 50, y: 50 });
  const end = strictEnd({ x: 0, y: 0 }, { x: 30, y: 28 }, "line", true);
  assert.ok(Math.abs(end.x - end.y) < 1e-10);
});
test("commands preserve input state and reject invalid or duplicate objects atomically", () => {
  const original = emptySketch();
  const changed = applySketchCommand(original, { kind: "replace", objects: [line] });
  assert.equal(original.objects.length, 0);
  assert.notEqual(changed.objects[0], line);
  assert.throws(() => applySketchCommand(changed, { kind: "replace", objects: [line, line] }));
  assert.equal(changed.objects.length, 1);
  assert.throws(() => validateSketch({ ...changed, objects: [{ ...line, start: { x: NaN, y: 0 } }] }));
  assert.throws(() => validateSketch({ ...changed, version: 2 }));
  assert.throws(() => validateSketch({ ...changed, objects: [{ ...line, style: { ...line.style, stroke: "url(remote)" } }] }));
});
test("recovery bounds aggregate points, text, objects, and raw bytes", () => {
  assert.deepEqual(parseSketch(JSON.stringify(emptySketch())), emptySketch());
  assert.throws(() => parseSketch(" ".repeat(SKETCH_LIMITS.bytes + 1)));
  assert.throws(() => validateSketch({ ...emptySketch(), objects: Array.from({ length: 1001 }, (_, i) => ({ ...line, id: String(i) })) }));
  assert.throws(() => validateSketch({ ...emptySketch(), objects: [{ id: "s", kind: "stroke", style: line.style, points: Array.from({ length: 100001 }, () => ({ x: 0, y: 0 })) }] }));
  assert.throws(() => validateSketch({ ...emptySketch(), objects: [0, 1].map(i => ({ id: String(i), kind: "text", style: line.style, position: { x: 0, y: 0 }, fontSize: 16, text: "a".repeat(5001) })) }));
});
test("completed changes undo and redo atomically, with new edits invalidating redo", () => {
  const first = commitSketch(sketchHistory(emptySketch()), { ...emptySketch(), objects: [line] });
  const moved = commitSketch(first, { ...first.present, objects: [moveObject(line, 10, -5)] });
  assert.deepEqual(undoSketch(moved).present, first.present);
  assert.deepEqual(redoSketch(undoSketch(moved)).present, moved.present);
  const cleared = commitSketch(undoSketch(moved), emptySketch());
  assert.equal(cleared.future.length, 0);
  assert.deepEqual(undoSketch(cleared).present, first.present);
  assert.equal(commitSketch(first, first.present), first);
  assert.throws(() => commitSketch(first, { ...first.present, objects: [line, line] }));
  assert.deepEqual(first.present.objects, [line]);
});
test("history keeps at most 100 completed actions", () => {
  let h = sketchHistory(emptySketch());
  for (let i = 0; i < 110; i++) h = commitSketch(h, { ...emptySketch(), objects: [moveObject(line, i, 0)] });
  assert.equal(h.past.length, 100);
});
test("hit testing distinguishes empty shape interiors, filled shapes, and top-level move geometry", () => {
  const rectangle: SketchObject = { ...line, kind: "rectangle", start: { x: 0, y: 0 }, end: { x: 100, y: 100 } };
  assert.equal(hitObject(rectangle, { x: 50, y: 50 }, 2), false);
  assert.equal(hitObject(rectangle, { x: 1, y: 50 }, 2), true);
  assert.equal(hitObject({ ...rectangle, style: { ...rectangle.style, fill: "#112233" } }, { x: 50, y: 50 }, 2), true);
  const stroke: SketchObject = { ...line, kind: "stroke", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
  assert.equal(hitObject(stroke, { x: 5, y: 5 }, 2), true);
  assert.deepEqual(objectBox(moveObject(stroke, 20, 30)), { x: 20, y: 30, width: 10, height: 10 });
  assert.deepEqual(stroke.points[0], { x: 0, y: 0 });
});

test("Fit frames artwork after pan and zoom, including stroke edges", () => {
  assert.equal(artworkBox([]), undefined);
  const bounds = artworkBox([line])!;
  assert.deepEqual(bounds, { x: 9, y: 19, width: 22, height: 22 });
  const view = fitSketch(900, 600, bounds);
  assert.equal(view.scale, 8);
  assert.deepEqual(viewPoint({ x: 450, y: 300 }, view), { x: 20, y: 30 });
  assert.notDeepEqual(view, zoomSketch({ ...view, x: -1000 }, { x: 100, y: 100 }, .5));
  const dot = fitSketch(900, 600, { x: 1200, y: 800, width: 0, height: 0 });
  assert.ok(Number.isFinite(dot.scale));
  assert.equal(dot.x + 1200 * dot.scale, 450);
  const tiny = fitSketch(100, 100, { x: -100000, y: -100000, width: 200000, height: 200000 });
  assert.ok(zoomSketch(tiny, { x: 50, y: 50 }, .5).scale <= tiny.scale);
});
test("text wrapping preserves emoji and combining graphemes in narrow boxes", () => {
  const text: SketchText = { id: "unicode", kind: "text", style: line.style, position: { x: 0, y: 0 }, text: "😀👩‍💻é", fontSize: 16, box: { width: 1, height: 20 } };
  assert.deepEqual(textLines(text, value => value.length), ["😀", "👩‍💻", "é"]);
  assert.deepEqual(textLines({ ...text, text: "   " }, value => value.length), [" ", " "]);
});
test("saved sketches round trip and edits do not change saved snapshots", () => {
  const document = { ...emptySketch(), objects: [line] };
  let book = saveNamedSketch(emptySketchbook(), document, "  First  ", "first", 100);
  assert.equal(book.workspace.name, "First");
  assert.equal(sketchIsDirty(book, document, "First"), false);
  const edited = { ...document, objects: [moveObject(line, 50, 0)] };
  assert.equal(sketchIsDirty(book, edited, "First"), true);
  assert.deepEqual(book.sketches[0].document.objects, [line]);
  book = saveNamedSketch(book, edited, "Renamed", "ignored", 200);
  assert.equal(book.sketches.length, 1);
  assert.equal(book.sketches[0].id, "first");
  assert.deepEqual(validateSketchbook(JSON.parse(serializeSketchbook(book))), book);
  assert.notEqual(book.workspace.document, book.sketches[0].document);
});
test("New, reopen and delete keep documents isolated and retain the active draft", () => {
  let book = saveNamedSketch(emptySketchbook(), { ...emptySketch(), objects: [line] }, "First", "first", 1);
  book = saveNamedSketch({ ...book, workspace: emptySketchbook().workspace }, emptySketch(), "Second", "second", 2);
  book = openNamedSketch(book, "first");
  assert.deepEqual(book.workspace.document.objects, [line]);
  book = removeNamedSketch(book, "second");
  assert.equal(book.workspace.savedId, "first");
  book = removeNamedSketch(book, "first");
  assert.equal(book.workspace.savedId, null);
  assert.equal(book.sketches.length, 0);
  assert.deepEqual(book.workspace.document.objects, [line]);
  assert.throws(() => openNamedSketch(book, "first"));
});
test("local recovery migrates legacy drafts without writing and prefers the collection", () => {
  const legacy = JSON.stringify({ ...emptySketch(), objects: [line] });
  let source: string | null = null;
  const storage = { getItem: (key: string) => key === SKETCHBOOK_KEY ? source : key === LEGACY_SKETCH_KEY ? legacy : null };
  assert.deepEqual(loadSketchbook(storage).book.workspace.document.objects, [line]);
  source = serializeSketchbook(emptySketchbook());
  assert.deepEqual(loadSketchbook(storage).book.workspace.document.objects, []);
  source = "broken";
  const failed = loadSketchbook(storage);
  assert.equal(failed.blocked, true);
  assert.match(failed.error, /unchanged/);
  assert.equal(source, "broken");
});
test("failed writes cannot replace the previous collection", () => {
  let stored = serializeSketchbook(emptySketchbook());
  const storage = { setItem: (key: string, value: string) => { assert.equal(key, SKETCHBOOK_KEY); if (value !== stored) throw new Error("quota"); stored = value; } };
  const book = saveNamedSketch(emptySketchbook(), emptySketch(), "First", "first", 1);
  assert.throws(() => writeSketchbook(storage, book), /quota/);
  assert.deepEqual(JSON.parse(stored), emptySketchbook());
  assert.equal(book.sketches.length, 1);
});
test("saved collection rejects duplicate identities, invalid names and capacity overflow", () => {
  const book = saveNamedSketch(emptySketchbook(), emptySketch(), "First", "first", 1);
  assert.throws(() => validateSketchbook({ ...book, sketches: [...book.sketches, ...book.sketches] }));
  assert.throws(() => validateSketchbook({ ...book, workspace: { ...book.workspace, savedId: "missing" } }));
  assert.throws(() => saveNamedSketch(book, emptySketch(), "a".repeat(121), "unused", 1));
  assert.throws(() => saveNamedSketch({ ...book, workspace: emptySketchbook().workspace }, emptySketch(), "Other", "first", 1));
  let full = emptySketchbook();
  for (let i = 0; i < SKETCHBOOK_LIMIT; i++) full = saveNamedSketch({ ...full, workspace: emptySketchbook().workspace }, emptySketch(), `Sketch ${i}`, String(i), i);
  assert.throws(() => saveNamedSketch({ ...full, workspace: emptySketchbook().workspace }, emptySketch(), "Extra", "extra", 1));
  assert.doesNotThrow(() => saveNamedSketch(full, emptySketch(), "Rename last", "unused", 2));
});

test("Sketchpad opens only for the exact Ctrl Shift D chord", () => {
  const chord = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: "KeyD" };
  assert.equal(isSketchpadShortcut(chord), true);
  for (const other of [{ ctrlKey: false }, { shiftKey: false }, { altKey: true }, { metaKey: true }, { code: "KeyF" }]) assert.equal(isSketchpadShortcut({ ...chord, ...other }), false);
});
