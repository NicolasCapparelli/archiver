import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { MathfieldElement, convertLatexToMarkup } from "mathlive";
import { expressionToLatex } from "./calculator-editing";
import "mathlive/fonts.css";
import "mathlive/static.css";

// Use Vite-bundled font faces and no external assets, sounds or competing keyboard.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
export type CalculatorEditor = MathfieldElement;
export function CalculationFormula({ source }: { source: string }) {
  const markup = useMemo(() => {
    try { return convertLatexToMarkup(expressionToLatex(source)); }
    catch { return null; }
  }, [source]);
  // Only MathLive's rendering of our bounded scientific grammar enters markup.
  return markup ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} /> : <span>{source}</span>;
}
interface Props {
  editor: RefObject<MathfieldElement | null>; value: string; saving: boolean;
  onChange: (latex: string) => void; onSelection: (prefix: string) => void;
  onKey: (event: KeyboardEvent) => void;
}
export function CalculatorMathField(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  useLayoutEffect(() => {
    const field = new MathfieldElement();
    props.editor.current = field;
    field.id = "calculator-expression";
    field.setAttribute("data-initial-focus", "");
    field.setAttribute("aria-label", "Expression");
    field.setAttribute("aria-describedby", "calculator-preview calculator-editing-hint");
    field.mathVirtualKeyboardPolicy = "manual";
    field.menuItems = [];
    field.popoverPolicy = "off";
    field.inlineShortcuts = {};
    field.smartFence = true;
    field.smartSuperscript = true;
    field.value = current.current.value;
    field.readOnly = current.current.saving;
    const selection = () => current.current.onSelection(field.getValue(0, field.position, "latex"));
    const input = () => { current.current.onChange(field.value); selection(); };
    const key = (event: KeyboardEvent) => current.current.onKey(event);
    field.addEventListener("input", input);
    field.addEventListener("selection-change", selection);
    field.addEventListener("keydown", key, true);
    host.current!.append(field);
    field.position = field.lastOffset;
    field.focus();
    return () => {
      field.removeEventListener("input", input);
      field.removeEventListener("selection-change", selection);
      field.removeEventListener("keydown", key, true);
      field.remove(); props.editor.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const field = props.editor.current;
    if (!field) return;
    if (field.value !== props.value) field.setValue(props.value, { silenceNotifications: true, selectionMode: "after" });
    field.readOnly = props.saving;
  }, [props.value, props.saving]);
  return <div className="calculator-math-editor" ref={host} />;
}
