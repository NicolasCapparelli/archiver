import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Pencil, Minus, Square, Circle, Type, Eraser, Hand, ZoomIn, ZoomOut, Scan, Save, FolderOpen, Trash2, X, ChevronDown, ArrowLeft, Undo2, Redo2, FilePlus2, Copy, Frame, PaintBucket, Palette } from "lucide-react";
import { fitSketch, viewPoint, zoomSketch, type SketchView, type SketchBounds } from "./sketchpad-viewport";
import { textLines, type SketchText } from "./sketchpad-text";
import { copySketchImage } from "./api";
import { emptySketch, shapeBox, strictEnd, SKETCH_LIMITS, type Point, type SketchDocument, type SketchObject } from "./sketchpad-model";
import { commitSketch, redoSketch, sketchHistory, undoSketch } from "./sketchpad-history";
import { artworkBox, hitObject, moveObject, objectBox } from "./sketchpad-geometry";
import { sketchPng } from "./sketchpad-export";
import { loadSketchbook, writeSketchbook, saveNamedSketch, openNamedSketch, removeNamedSketch, sketchIsDirty, type Sketchbook } from "./sketchpad-storage";
type Tool = "select" | "stroke" | "line" | "rectangle" | "ellipse" | "text" | "eraser" | "hand";
type Gesture = { start: Point; end: Point; original: SketchDocument; objects: SketchObject[]; ids: string[]; pointerId: number; mode: "draw" | "move" | "marquee" | "erase" | "text"; object?: SketchObject; pointBudget?: number; additive: boolean };
const tools: [Tool, string, string][] = [["select", "Select", "V"], ["stroke", "Pen", "P"], ["line", "Line", "L"], ["rectangle", "Rectangle", "R"], ["ellipse", "Ellipse", "O"], ["text", "Text", "T"], ["eraser", "Eraser", "E"], ["hand", "Pan", "H"]];
const icons = { select: MousePointer2, stroke: Pencil, line: Minus, rectangle: Square, ellipse: Circle, text: Type, eraser: Eraser, hand: Hand };
const cursorPaths: Partial<Record<Tool, string>> = { stroke: '<path d="m4 20 1-5L17 3l4 4L9 19Z M14 6l4 4"/>', line: '<path d="M4 20 20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>', rectangle: '<rect x="3" y="5" width="18" height="14" rx="1"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>', eraser: '<path d="m3 14 10-11 8 7-10 11H9Z M8 9l8 7"/>' };
function toolCursor(tool: Tool) {
  if (tool === "select") return "default";
  if (tool === "text") return "text";
  if (tool === "hand") return "grab";
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="#202823" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${cursorPaths[tool]}</svg>`;
  const hotspot = tool === "rectangle" ? "4 6" : tool === "ellipse" ? "4 14" : tool === "eraser" ? "4 16" : "4 23";
  return `url("data:image/svg+xml,${encodeURIComponent(art)}") ${hotspot}, default`;
}
export function Sketchpad({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => loadSketchbook(localStorage));
  const [history, setHistory] = useState(() => sketchHistory(initial.book.workspace.document));
  const [book, setBook] = useState(initial.book), [name, setName] = useState(initial.book.workspace.name);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const focusText = useCallback((element: HTMLTextAreaElement | null) => { element?.focus({ preventScroll: true }); }, []);
  const [tool, setTool] = useState<Tool>("stroke"), [color, setColor] = useState("#202823"), [width, setWidth] = useState(3), [fill, setFill] = useState(false), [fontSize, setFontSize] = useState(24);
  const [selected, setSelected] = useState<string[]>([]), [preview, setPreview] = useState<Gesture>(), [message, setMessage] = useState(initial.error), [busy, setBusy] = useState(false);
  const [textEdit, setTextEdit] = useState<SketchText>();
  const [space, setSpace] = useState(false), [panning, setPanning] = useState(false);
  const gesture = useRef<Gesture | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const fitBounds = useRef<SketchBounds | undefined>(undefined);
  const fitted = useRef(true), stageSize = useRef({ width: 0, height: 0 });
  const pan = useRef<{ pointerId: number; start: Point; view: SketchView } | undefined>(undefined);
  const [view, setView] = useState<SketchView>({ x: 32, y: 32, scale: .5 });
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight, old = stageSize.current;
      if (!width || !height) return;
      stageSize.current = { width, height };
      setView(v => fitted.current ? fitSketch(width, height, fitBounds.current) : { ...v, x: v.x + (width - old.width) / 2, y: v.y + (height - old.height) / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const reset = () => { setSpace(false); cancelPan(); cancelGesture(); };
    window.addEventListener("blur", reset);
    return () => window.removeEventListener("blur", reset);
  }, []);
  useEffect(() => {
    const element = stage.current;
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("textarea")) return;
      event.preventDefault();
      if (gesture.current || pan.current || textEdit) return;
      const rect = element!.getBoundingClientRect();
      fitted.current = false;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setView(v => zoomSketch(v, { x: event.clientX - rect.left - element!.clientLeft, y: event.clientY - rect.top - element!.clientTop }, Math.exp(-Math.max(-300, Math.min(300, delta)) * .002)));
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, [textEdit]);
  function fit(page = false) {
    const element = stage.current;
    if (!element || !element.clientWidth || !element.clientHeight) return;
    cancelGesture(); cancelPan();
    fitted.current = true;
    fitBounds.current = page ? undefined : artworkBox(doc.objects);
    const next = fitSketch(element.clientWidth, element.clientHeight, fitBounds.current);
    stageSize.current = { width: element.clientWidth, height: element.clientHeight };
    setView(next);
    setMessage(`${page || !doc.objects.length ? "Canvas" : "Sketch"} fitted to view · ${Number((next.scale * 100).toFixed(1))}%`);
  }
  function zoom(factor: number) {
    fitted.current = false;
    setView(v => zoomSketch(v, { x: stageSize.current.width / 2, y: stageSize.current.height / 2 }, factor));
  }
  function chooseTool(value: Tool) { cancelGesture(); cancelPan(); setSelected([]); setTool(value); root.current?.focus({ preventScroll: true }); }
  const doc = history.present;
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  const dirty = useMemo(() => sketchIsDirty(book, doc, name), [book, doc, name]);
  const locked = busy || !!preview || !!textEdit || panning;
  function writeBook(next: Sketchbook) {
    if (initial.blocked) { setMessage(initial.error); return false; }
    try { writeSketchbook(localStorage, next); return true; }
    catch (error) { setMessage(`Could not save locally: ${String(error)}. Current work stays in memory. Keep Sketchpad open and retry.`); return false; }
  }
  function persist(document: SketchDocument) {
    const next: Sketchbook = { ...book, workspace: { ...book.workspace, name: name.trim() || "Untitled sketch", document } };
    setBook(next); writeBook(next);
  }
  function saveSketch() {
    if (locked) { setMessage("Finish the current edit before saving the sketch."); return; }
    try {
      const next = saveNamedSketch(book, doc, name, crypto.randomUUID(), Date.now());
      if (!writeBook(next)) return;
      setBook(next); setName(next.workspace.name); setMessage(`Saved “${next.workspace.name}” locally.`);
    } catch (error) { setMessage(String(error)); }
  }
  function switchWorkspace(next: Sketchbook) {
    if (dirty && !window.confirm("Leave this sketch? Unsaved changes will be replaced. Cancel and choose Save sketch to keep them.")) return;
    if (!writeBook(next)) return;
    cancelGesture(); cancelPan(); setBook(next); setName(next.workspace.name);
    setHistory(sketchHistory(next.workspace.document)); setSelected([]); setTextEdit(undefined);
    fitted.current = true; fitBounds.current = undefined;
    if (stage.current) setView(fitSketch(stage.current.clientWidth, stage.current.clientHeight));
    setMessage(`Opened “${next.workspace.name}”.`); root.current?.focus({ preventScroll: true });
  }
  function openSaved(id: string) {
    if (id === book.workspace.savedId && !dirty) { setMessage("This sketch is already open."); return; }
    try { switchWorkspace(openNamedSketch(book, id)); } catch (error) { setMessage(String(error)); }
  }
  function deleteSaved(id: string) {
    const saved = book.sketches.find(s => s.id === id);
    if (!saved || !window.confirm(`Delete saved sketch “${saved.name}”? Copied archive images remain. The open drawing stays available as a draft.`)) return;
    const current = { ...book, workspace: { ...book.workspace, name: name.trim() || "Untitled sketch", document: doc } };
    const next = removeNamedSketch(current, id);
    if (writeBook(next)) { setBook(next); setMessage(`Deleted “${saved.name}” from saved sketches.`); }
  }
  function commit(objects: SketchObject[]) {
    try { const next = commitSketch(history, { ...doc, objects }); if (next === history) return true; setHistory(next); setMessage(""); persist(next.present); return true; }
    catch (error) { setMessage(String(error)); return false; }
  }
  function travel(redo: boolean) {
    const next = redo ? redoSketch(history) : undoSketch(history);
    if (next === history) return;
    setHistory(next); setSelected([]); setMessage(""); persist(next.present);
  }
  function cancelGesture() {
    const id = gesture.current?.pointerId;
    gesture.current = undefined; setPreview(undefined);
    if (id !== undefined && stage.current?.hasPointerCapture(id)) stage.current.releasePointerCapture(id);
  }
  function cancelPan() {
    const id = pan.current?.pointerId;
    pan.current = undefined; setPanning(false);
    if (id !== undefined && stage.current?.hasPointerCapture(id)) stage.current.releasePointerCapture(id);
  }
  function escape() {
    if (pan.current) cancelPan();
    else if (gesture.current) cancelGesture();
    else if (textEdit) { setTextEdit(undefined); root.current?.focus({ preventScroll: true }); }
    else if (libraryOpen) setLibraryOpen(false);
    else if (selected.length) setSelected([]);
    else onClose();
  }
  function saveText() {
    if (!textEdit) return;
    const existing = doc.objects.find(o => o.id === textEdit.id);
    const object: SketchObject = { ...textEdit };
    const objects = doc.objects.filter(o => o.id !== textEdit.id);
    if (textEdit.text) objects.splice(existing ? doc.objects.indexOf(existing) : objects.length, 0, object);
    if (commit(objects)) { setTextEdit(undefined); root.current?.focus({ preventScroll: true }); }
  }
  async function copyImage() {
    setBusy(true); setMessage("Rendering image…");
    try { await copySketchImage(await sketchPng(doc)); setMessage("Image copied. Paste it into an image-capable app."); }
    catch (error) { setMessage(`Could not copy: ${String(error)}`); }
    finally { setBusy(false); }
  }
  function localPoint(event: { clientX: number; clientY: number }) {
    const rect = stage.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left - stage.current!.clientLeft, y: event.clientY - rect.top - stage.current!.clientTop };
  }
  function position(event: { clientX: number; clientY: number }) {
    const p = viewPoint(localPoint(event), view);
    return { x: Math.max(0, Math.min(1200, p.x)), y: Math.max(0, Math.min(800, p.y)) };
  }
  function tolerance() { return 5 / view.scale; }
  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (textEdit || gesture.current || pan.current || busy || (event.button !== 0 && event.button !== 1)) return;
    root.current?.focus({ preventScroll: true }); event.preventDefault();
    if (event.button === 1 || space || tool === "hand") {
      fitted.current = false;
      pan.current = { pointerId: event.pointerId, start: localPoint(event), view };
      setPanning(true); stage.current!.setPointerCapture(event.pointerId); return;
    }
    const raw = viewPoint(localPoint(event), view);
    if (raw.x < 0 || raw.y < 0 || raw.x > 1200 || raw.y > 800) return;
    if (tool !== "select" && tool !== "eraser" && doc.objects.length >= SKETCH_LIMITS.objects) { setMessage("Object limit reached. Erase objects before drawing more."); return; }
    const pointBudget = SKETCH_LIMITS.points - doc.objects.reduce((sum, o) => sum + (o.kind === "stroke" ? o.points.length : 0), 0);
    if (tool === "stroke" && pointBudget < 1) { setMessage("Stroke point limit reached. Erase a stroke before drawing more."); return; }
    const p = position(event), hit = [...doc.objects].reverse().find(o => hitObject(o, p, tolerance()));
    let g: Gesture = { start: p, end: p, original: doc, objects: doc.objects, ids: [], pointBudget, mode: "draw", pointerId: event.pointerId, additive: event.shiftKey };
    if (tool === "text") { g.mode = "text"; setSelected([]); }
    else if (tool === "select") {
      if (hit) {
        g.ids = event.shiftKey ? selected.includes(hit.id) ? selected.filter(id => id !== hit.id) : [...selected, hit.id] : selected.includes(hit.id) ? selected : [hit.id];
        setSelected(g.ids); g.mode = "move";
      } else { g.mode = "marquee"; g.ids = event.shiftKey ? selected : []; if (!event.shiftKey) setSelected([]); }
    } else if (tool === "eraser") { g.mode = "erase"; g.objects = doc.objects.filter(o => !hitObject(o, p, tolerance())); }
    else {
      const base = { id: crypto.randomUUID(), style: { stroke: color, width, fill: fill ? color : null } };
      g.object = tool === "stroke" ? { ...base, kind: "stroke", points: [p] } : { ...base, kind: tool, start: p, end: p };
    }
    gesture.current = g; setPreview({ ...g }); stage.current!.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<HTMLDivElement>) {
    const drag = pan.current;
    if (drag?.pointerId === event.pointerId) {
      const p = localPoint(event);
      setView({ ...drag.view, x: drag.view.x + p.x - drag.start.x, y: drag.view.y + p.y - drag.start.y }); return;
    }
    const g = gesture.current; if (!g || g.pointerId !== event.pointerId) return;
    const p = position(event), previous = g.end; g.end = p;
    if (g.mode === "move") g.objects = g.original.objects.map(o => g.ids.includes(o.id) ? moveObject(o, p.x - g.start.x, p.y - g.start.y) : o);
    else if (g.mode === "erase") {
      const steps = Math.min(1024, Math.max(1, Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / Math.max(1, tolerance()))));
      g.objects = g.objects.filter(o => {
        for (let i = 1; i <= steps; i++) if (hitObject(o, { x: previous.x + (p.x - previous.x) * i / steps, y: previous.y + (p.y - previous.y) * i / steps }, tolerance())) return false;
        return true;
      });
    }
    else if (g.object?.kind === "stroke") {
      const points = g.object.points;
      if (points.length < g.pointBudget! && Math.hypot(p.x - points[points.length - 1].x, p.y - points[points.length - 1].y) >= .75) g.object = { ...g.object, points: [...points, p] };
      if (points.length >= g.pointBudget!) setMessage("Stroke point limit reached. Erase a stroke before drawing more.");
    } else if (g.object && g.object.kind !== "text") g.object = { ...g.object, end: strictEnd(g.start, p, g.object.kind, event.shiftKey) };
    setPreview({ ...g });
  }
  function up(event: React.PointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId === event.pointerId) {
      move(event); pan.current = undefined; setPanning(false);
      if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    move(event); const g = gesture.current!;
    if (g.mode === "text") {
      const box = shapeBox(g.start, g.end);
      // A click supplies a useful default box. Dragging sets its actual bounds.
      const w = box.width < 8 ? Math.min(300, 1200 - box.x) : box.width;
      const h = Math.max(fontSize * 1.25, box.height);
      if (w >= 1) setTextEdit({ id: crypto.randomUUID(), kind: "text", position: { x: box.x, y: box.y }, text: "", fontSize, box: { width: w, height: h }, style: { stroke: color, width, fill: null } });
    } else if (g.mode === "marquee") {
      const b = shapeBox(g.start, g.end);
      setSelected([...new Set([...g.ids, ...doc.objects.filter(o => { const a = objectBox(o); return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height; }).map(o => o.id)])]);
    } else if (g.object && g.object.kind !== "stroke" && g.object.kind !== "text" && Math.hypot(g.object.end.x - g.object.start.x, g.object.end.y - g.object.start.y) < .5) {
      setMessage("Drag to draw a line or shape.");
    } else commit(g.object ? [...g.original.objects, g.object] : g.objects);
    cancelGesture();
  }
  const objects = preview ? preview.object ? [...preview.objects, preview.object] : preview.objects : doc.objects;
  return <div className="sketchpad" ref={root} tabIndex={-1} onKeyUp={event => { if (event.code === "Space") setSpace(false); }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); escape(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveSketch(); return; }
    if ((event.target as HTMLElement).closest("input,textarea,select")) return;
    if (event.code === "Space" && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); setSpace(true); return; }
    if (gesture.current || pan.current || textEdit || busy) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.2); return; }
    if (event.key === "-") { event.preventDefault(); zoom(1 / 1.2); return; }
    if (event.code === "Digit0" || event.key === "0") { event.preventDefault(); fit(event.shiftKey); return; }
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "z") { event.preventDefault(); travel(event.shiftKey); }
      if (event.shiftKey && event.key.toLowerCase() === "c" && !busy) { event.preventDefault(); void copyImage(); }
      return;
    }
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); commit(doc.objects.filter(o => !selected.includes(o.id))); setSelected([]); }
    const choice = tools.find(t => t[2].toLowerCase() === event.key.toLowerCase()); if (choice) { event.preventDefault(); chooseTool(choice[0]); }
  }}>
    <div className="sketch-control-row" role="group" aria-label="Sketchpad controls">
      <button className="secondary sketch-icon" aria-label="Back to Librarian" title="Back to Librarian (Esc)" onClick={onClose}><ArrowLeft size={17} /></button>
      <input id="sketch-name" className="setting-input" aria-label="Sketch name" title="Sketch name. Save to rename this sketch." value={name} maxLength={120} onChange={e => setName(e.target.value)} disabled={locked} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveSketch(); } }} />
      <span className={`sketch-save-state ${dirty ? "dirty" : ""}`} role="img" aria-label={dirty ? "Unsaved changes" : book.workspace.savedId ? "Saved locally" : "Working draft"} title={dirty ? "Unsaved changes. Save to keep a named version." : book.workspace.savedId ? "Saved locally" : "Working draft"} />
      <div className="sketch-control-group">
        <button className="secondary sketch-icon" aria-label="Save sketch" title="Save sketch locally (Ctrl+S)" disabled={locked || initial.blocked} onClick={saveSketch}><Save size={17} /></button>
        <button className={`secondary sketch-icon ${libraryOpen ? "chosen" : ""}`} aria-label="Saved sketches" title={`Open saved sketches (${book.sketches.length})`} aria-expanded={libraryOpen} aria-controls="saved-sketches" disabled={locked} onClick={() => setLibraryOpen(!libraryOpen)}><FolderOpen size={17} /></button>
        <button className="secondary sketch-icon" aria-label="New sketch" title="Start a new sketch" disabled={locked} onClick={() => switchWorkspace({ ...book, workspace: { savedId: null, name: "Untitled sketch", document: emptySketch() } })}><FilePlus2 size={17} /></button>
      </div>
      <div className="sketch-control-group sketch-properties">
        <label title="Ink color"><Palette size={14} aria-hidden="true" /><span className="sketch-select"><span className="sketch-ink-swatch" style={{ background: textEdit?.style.stroke ?? color }} /><select aria-label="Ink color" value={textEdit?.style.stroke ?? color} onChange={e => { setColor(e.target.value); if (textEdit) setTextEdit({ ...textEdit, style: { ...textEdit.style, stroke: e.target.value } }); }}>{[["#202823", "Black"], ["#c23b3b", "Red"], ["#2166b1", "Blue"], ["#2e7d45", "Green"], ["#b37b14", "Gold"], ["#ffffff", "White"]].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><ChevronDown size={12} aria-hidden="true" /></span></label>
        <label title="Stroke width"><span className="sketch-select"><select aria-label="Stroke width" disabled={!!textEdit} value={width} onChange={e => setWidth(Number(e.target.value))}>{[1, 3, 6, 12].map(n => <option key={n} value={n}>{n} px</option>)}</select><ChevronDown size={12} aria-hidden="true" /></span></label>
        <button className={`sketch-fill chip sketch-icon ${fill ? "chosen" : ""}`} aria-label="Fill shapes" title={`Fill shapes: ${fill ? "on" : "off"}`} aria-pressed={fill} disabled={!!textEdit} onClick={() => setFill(!fill)}><PaintBucket size={17} /></button>
        <label title="Text size"><Type size={14} aria-hidden="true" /><span className="sketch-select"><select aria-label="Text size" value={textEdit?.fontSize ?? fontSize} onChange={e => { const size = Number(e.target.value); setFontSize(size); if (textEdit) setTextEdit({ ...textEdit, fontSize: size }); }}>{[16, 24, 36, 48, 72].map(n => <option key={n}>{n}</option>)}</select><ChevronDown size={12} aria-hidden="true" /></span></label>
      </div>
      <div className="sketch-control-group">
        <button className="secondary sketch-icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.past.length || locked} onClick={() => travel(false)}><Undo2 size={17} /></button>
        <button className="secondary sketch-icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.future.length || locked} onClick={() => travel(true)}><Redo2 size={17} /></button>
        <button className="secondary sketch-icon" aria-label="Delete selected objects" title="Delete selected objects (Delete)" disabled={!selected.length || locked} onClick={() => { commit(doc.objects.filter(o => !selected.includes(o.id))); setSelected([]); }}><Trash2 size={17} /></button>
        <button className="primary sketch-icon" aria-label={busy ? "Copying image" : "Copy image"} title="Copy sketch as an image (Ctrl+Shift+C)" disabled={locked} onClick={() => void copyImage()}><Copy size={17} /></button>
      </div>
      <div className="sketch-control-group sketch-zoom">
        <button className="secondary sketch-icon" aria-label="Zoom out" title="Zoom out (-)" disabled={!!preview || !!textEdit || panning} onClick={() => zoom(1 / 1.2)}><ZoomOut size={17} /></button>
        <output aria-label="Canvas zoom">{Number((view.scale * 100).toFixed(1))}%</output>
        <button className="secondary sketch-icon" aria-label="Zoom in" title="Zoom in (+)" disabled={!!preview || !!textEdit || panning} onClick={() => zoom(1.2)}><ZoomIn size={17} /></button>
        <button className="secondary sketch-icon" aria-label="Fit drawing" title="Fit drawing (0). Uses the canvas when empty." disabled={!!textEdit} onClick={() => fit()}><Scan size={17} /></button>
        <button className="secondary sketch-icon" aria-label="Fit canvas" title="Fit full canvas (Shift+0)" disabled={!!textEdit} onClick={() => fit(true)}><Frame size={17} /></button>
      </div>
    </div>
    <div className="sketch-workspace">
      <div className="sketch-tools" role="toolbar" aria-label="Sketchpad tools" aria-orientation="vertical">
        {tools.map(([value, label, key]) => { const Icon = icons[value]; return <button key={value} className={`chip ${tool === value ? "chosen" : ""}`} aria-label={label} aria-pressed={tool === value} title={`${label} (${key})`} disabled={!!textEdit || busy} onClick={() => chooseTool(value)}><Icon size={19} /></button>; })}
      </div>
      <div className="sketch-stage" ref={stage} style={{ cursor: panning ? "grabbing" : space ? "grab" : toolCursor(tool) }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={() => { cancelGesture(); cancelPan(); }}
        onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) cancelGesture(); if (pan.current?.pointerId === event.pointerId) { pan.current = undefined; setPanning(false); } }}
        onDoubleClick={event => {
          if (textEdit || busy || tool !== "select") return;
          const hit = [...doc.objects].reverse().find(o => hitObject(o, position(event), tolerance()));
          if (hit?.kind === "text") { setSelected([]); setTextEdit({ ...hit, box: hit.box ?? { width: Math.max(100, objectBox(hit).width), height: objectBox(hit).height } }); }
        }}>
        <div className="sketch-paper" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="sketch-canvas" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Sketch canvas. Drag to draw. Scroll to zoom. Hold Space and drag to pan.">
      <rect width="1200" height="800" fill="#ffffff" />
      {objects.filter(o => o.id !== textEdit?.id).map(o => <g key={o.id} stroke={o.style.stroke} strokeWidth={o.style.width} fill={o.style.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round">
        {o.kind === "stroke" ? o.points.length === 1 ? <circle cx={o.points[0].x} cy={o.points[0].y} r={o.style.width / 2} stroke="none" fill={o.style.stroke} /> : <polyline fill="none" points={o.points.map(p => `${p.x},${p.y}`).join(" ")} /> : o.kind === "line" ? <line x1={o.start.x} y1={o.start.y} x2={o.end.x} y2={o.end.y} /> : o.kind === "text" ? <text stroke="none" fill={o.style.stroke} fontFamily="DM Sans" fontSize={o.fontSize} dominantBaseline="text-before-edge">{textLines(o).map((line, i) => <tspan key={i} x={o.position.x} y={o.position.y + i * o.fontSize * 1.25}>{line || " "}</tspan>)}</text> : o.kind === "rectangle" ? <rect {...shapeBox(o.start, o.end)} /> : (() => { const b = shapeBox(o.start, o.end); return <ellipse cx={b.x + b.width / 2} cy={b.y + b.height / 2} rx={b.width / 2} ry={b.height / 2} />; })()}
      </g>)}
      {objects.filter(o => tool === "select" && selected.includes(o.id)).map(o => { const b = objectBox(o); return <rect key={o.id} x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} fill="none" stroke="#2166b1" strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} pointerEvents="none" />; })}
      {(preview?.mode === "marquee" || preview?.mode === "text") && <rect {...shapeBox(preview.start, preview.end)} fill="#2166b122" stroke="#2166b1" pointerEvents="none" />}
        </svg>
        {textEdit && <textarea className="sketch-text-input" aria-label="Sketch text. Enter saves. Shift Enter adds a line. Escape cancels." ref={focusText} spellCheck={false} maxLength={SKETCH_LIMITS.text - doc.objects.reduce((sum, o) => sum + (o.kind === "text" && o.id !== textEdit.id ? o.text.length : 0), 0)}
          style={{ left: textEdit.position.x, top: textEdit.position.y, width: textEdit.box!.width, height: Math.max(textEdit.box!.height, textLines(textEdit).length * textEdit.fontSize * 1.25 + textEdit.fontSize * 1.25), fontSize: textEdit.fontSize, color: textEdit.style.stroke }}
          value={textEdit.text} onChange={event => setTextEdit({ ...textEdit, text: event.target.value })}
          onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); saveText(); }
          }} />}
        </div>
      </div>
      {libraryOpen && <section className="sketch-library" id="saved-sketches" aria-label="Saved sketches">
        <header><strong>Saved sketches</strong><button className="secondary" aria-label="Close saved sketches" title="Close saved sketches" onClick={() => setLibraryOpen(false)}><X size={15} /></button></header>
        <p>Stored on this device. Save changes before opening another sketch.</p>
        <div className="sketch-library-list">
          {!book.sketches.length && <p>No saved sketches yet. Name your sketch, then choose Save sketch.</p>}
          {[...book.sketches].sort((a, b) => b.updatedAt - a.updatedAt).map(saved => <div className={`sketch-library-row ${saved.id === book.workspace.savedId ? "active" : ""}`} key={saved.id}>
            <button className="sketch-open" disabled={locked} aria-current={saved.id === book.workspace.savedId ? "true" : undefined} onClick={() => openSaved(saved.id)}><strong>{saved.name}</strong><small>{saved.document.objects.length} objects · {new Date(saved.updatedAt).toLocaleDateString()}</small></button>
            <button className="secondary" disabled={locked} aria-label={`Delete saved sketch ${saved.name}`} title="Delete saved sketch" onClick={() => deleteSaved(saved.id)}><Trash2 size={15} /></button>
          </div>)}
        </div>
      </section>}
    </div>
    <div className="sketch-caption"><span>{textEdit ? "Enter saves · Shift Enter adds a line · Esc cancels" : `${tools.find(t => t[0] === tool)![1]} · Scroll to zoom · Space + drag to pan`}</span><span>{doc.objects.length} objects · 1200 × 800</span></div>
    <p className="sketch-status" role="status" title={message}>{message || "Working draft recovers after each edit. Save sketch keeps a named version. Eraser removes whole objects. Shift constrains shapes or adds to selection."}</p>
    <div className="sketch-shortcuts" aria-label="Sketchpad shortcuts"><span><kbd>V/P/L/R/O/T/E/H</kbd> tools</span><span><kbd>Ctrl S</kbd> save</span><span><kbd>0</kbd> fit</span><span><kbd>Ctrl Z</kbd> undo</span><span><kbd>Ctrl Shift Z</kbd> redo</span><span><kbd>Ctrl Shift C</kbd> copy image</span><span><kbd>Esc</kbd> cancel / back</span></div>
  </div>;
}
