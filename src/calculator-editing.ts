import { calculatorFunctions, evaluateCalculation, type AngleMode } from "./calculator-engine.ts";

export const draftKey = "archiver.calculator.draft.v1";
export interface CalculatorDraft {
  version: 1; latex: string; mode: AngleMode; variables: Record<string, number>; answer: number; lastResult: number | null;
}
export const emptyDraft = (): CalculatorDraft => ({ version: 1, latex: "", mode: "deg", variables: {}, answer: 0, lastResult: null });
export function readDraft(raw: string | null): CalculatorDraft {
  if (!raw) return emptyDraft();
  const value = JSON.parse(raw) as CalculatorDraft;
  if (!value || value.version !== 1 || typeof value.latex !== "string" || value.latex.length > 8192 ||
      !value.variables || typeof value.variables !== "object" || Array.isArray(value.variables) ||
      !(value.lastResult === null || typeof value.lastResult === "number" && Number.isFinite(value.lastResult))) throw new Error("Invalid saved calculator draft.");
  evaluateCalculation({ expression: "0", mode: value.mode, variables: value.variables, answer: value.answer });
  return { ...value, variables: { ...value.variables } };
}

// Accept only the scientific editor's bounded subset, never general TeX or executable code.
// Braces are grouping; incomplete templates fail rather than silently dropping placeholders.
export function latexToExpression(latex: string): string {
  if (latex.length > 8192) throw new Error("Expression is too long.");
  let i = 0, depth = 0;
  function group(): string {
    if (latex[i] !== "{") throw new Error("Complete the math template.");
    i++; const value = parse("}");
    if (latex[i++] !== "}") throw new Error("Complete the math template.");
    return value;
  }
  function parse(stop = ""): string {
    if (++depth > 64) throw new Error("Use fewer nested operations (maximum 64).");
    let out = "";
    while (i < latex.length && latex[i] !== stop) {
      const c = latex[i++];
      if (/\s/.test(c)) continue;
      if (c === "{") { i--; out += `(${group()})`; continue; }
      if (c === "\\") {
        const command = /^[a-zA-Z]+/.exec(latex.slice(i))?.[0];
        if (!command) { const symbol = latex[i++]; if (symbol === "%") out += "%"; else if (![",", ";", "!", " "].includes(symbol)) throw new Error("Unsupported math symbol."); continue; }
        i += command.length;
        while (latex[i] === " ") i++;
        if (["left", "right", "mleft", "mright"].includes(command)) continue;
        if (["frac", "dfrac", "tfrac"].includes(command)) { const a = group(), b = group(); out += `((${a})/(${b}))`; }
        else if (command === "sqrt") {
          let root = "2";
          if (latex[i] === "[") { i++; root = parse("]"); if (latex[i++] !== "]") throw new Error("Complete the root."); }
          const body = group(); out += root === "2" ? `sqrt(${body})` : root === "3" ? `cbrt(${body})` : `((${body})^(1/(${root})))`;
        } else if (["operatorname", "mathrm", "mathit", "text"].includes(command)) {
          const name = group(); if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) throw new Error("Use a function or variable name."); out += name;
        } else if (["cdot", "times"].includes(command)) out += "*";
        else if (command === "div") out += "/";
        else if (command === "pi") out += "pi";
        else if (command === "tau") out += "tau";
        else if (["arcsin", "arccos", "arctan"].includes(command)) out += command.replace("arc", "a");
        else if (calculatorFunctions.includes(command)) out += command;
        else throw new Error(`Unsupported math command: ${command}.`);
      } else if (c === "_") {
        const name = latex[i] === "{" ? group() : latex[i++];
        if (!name || !/^[a-zA-Z0-9]+$/.test(name)) throw new Error("Invalid variable subscript."); out += `_${name}`;
      } else if (/^[a-zA-Z0-9.+\-*/^!%(),=]$/.test(c)) out += c;
      else if (c === "π") out += "pi";
      else if (c === "−") out += "-";
      else throw new Error("Complete the expression using supported scientific operations.");
      if (out.length > 1024) throw new Error("Use at most 1,024 characters per expression.");
    }
    depth--; return out;
  }
  const result = parse();
  if (result.length > 1024) throw new Error("Use at most 1,024 characters per expression.");
  return result;
}

// Source stored in the archive stays readable and can round-trip through the editor.
export function expressionToLatex(source: string): string {
  if (source.length > 1024) throw new Error("Expression is too long.");
  source = source.replaceAll("π", "pi").replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9_]*|[^\s]/g) ?? [];
  let i = 0, depth = 0;
  const name = (token: string) => token === "pi" || token === "tau" ? `\\${token} ` : token.length > 1 ? `\\operatorname{${token}}` : token;
  const take = (expected: string) => { if (tokens[i++] !== expected) throw new Error("Invalid archived expression."); };
  function expression(minimum = 0): string {
    if (++depth > 64) throw new Error("Use fewer nested operations.");
    const token = tokens[i++];
    let left: string;
    if (token === "+" || token === "-") left = token + expression(25);
    else if (token === "(") { left = `\\left(${expression()}\\right)`; take(")"); }
    else if (token && /^(\d|\.)/.test(token)) left = token;
    else if (token && /^[a-zA-Z]/.test(token)) {
      if (calculatorFunctions.includes(token) && tokens[i] === "(") {
        i++; const args: string[] = [];
        if (tokens[i] !== ")") { args.push(expression()); while (tokens[i] === ",") { i++; args.push(expression()); } }
        take(")");
        left = token === "sqrt" && args.length === 1 ? `\\sqrt{${args[0]}}` : token === "cbrt" && args.length === 1 ? `\\sqrt[3]{${args[0]}}` : `${name(token)}\\left(${args.join(",")}\\right)`;
      } else left = name(token);
    } else throw new Error("Invalid archived expression.");
    while (i < tokens.length) {
      const op = tokens[i];
      if ((op === "!" || op === "%") && minimum <= 40) { i++; left += op === "%" ? "\\%" : "!"; continue; }
      const implicit = op === "(" || /^[a-zA-Z]/.test(op);
      const precedence = ["+", "-"].includes(op) ? 10 : ["*", "/"].includes(op) || implicit ? 20 : op === "^" ? 30 : -1;
      if (precedence < minimum) break;
      if (!implicit) i++;
      const right = expression(op === "^" ? precedence : precedence + 1);
      left = op === "/" ? `\\frac{${left}}{${right}}` : op === "^" ? `${left}^{${right}}` : `${left}${implicit || op === "*" ? "\\cdot " : op}${right}`;
    }
    depth--; return left;
  }
  let assignment = "";
  const first = tokens[0];
  if (first && /^[a-zA-Z]/.test(first) && tokens[1] === "=") { assignment = name(first) + "="; i = 2; }
  const latex = assignment + expression();
  if (i !== tokens.length) throw new Error("Invalid archived expression.");
  return latex;
}

export function insertionLatex(text: string): string {
  const templates: Record<string, string> = { "/": "\\frac{#@}{#?}", "^": "^{#?}", "^2": "^{2}", "sqrt(": "\\sqrt{#?}", "cbrt(": "\\sqrt[3]{#?}", "(": "\\left(#?\\right)", "*": "\\cdot ", "%": "\\%" };
  return templates[text] ?? (text.endsWith("(") ? `\\operatorname{${text.slice(0, -1)}}\\left(#?\\right)` : /^[+\-),=.!]$/.test(text) ? text : expressionToLatex(text));
}

export function completions(prefix: string, variables: Record<string, number>): string[] {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(prefix)) return [];
  return [...new Set([...calculatorFunctions, ...Object.keys(variables), "ans", "pi", "tau", "e"])]
    .filter(name => name.startsWith(prefix) && (name !== prefix || calculatorFunctions.includes(name))).sort().slice(0, 6);
}
export function argumentHint(source: string): string {
  const stack: { name: string; argument: number }[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "(") stack.push({ name: /([a-zA-Z]+)$/.exec(source.slice(0, i))?.[1] ?? "", argument: 1 });
    else if (source[i] === ")") stack.pop();
    else if (source[i] === "," && stack.length) stack[stack.length - 1].argument++;
  }
  const current = [...stack].reverse().find(frame => calculatorFunctions.includes(frame.name));
  return current ? `${current.name}(${["min", "max"].includes(current.name) ? "value, …" : "value"}) · argument ${current.argument}` : "";
}

export interface RecallState { index: number; draft: CalculatorDraft | null }
export function recallHistory(state: RecallState, direction: -1 | 1, draft: CalculatorDraft, rows: { calculation: { expression: string; mode: AngleMode; variables: Record<string, number>; answer: number } }[]) {
  const index = Math.max(-1, Math.min(rows.length - 1, state.index + direction));
  if (index === state.index) return { state, draft };
  const original = state.draft ?? draft;
  const row = rows[index]?.calculation;
  return { state: { index, draft: index < 0 ? null : original }, draft: row ? { ...original, latex: expressionToLatex(row.expression), mode: row.mode, variables: { ...row.variables }, answer: row.answer } : original };
}
