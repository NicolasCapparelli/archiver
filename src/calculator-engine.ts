// Deliberately small real-number grammar. No eval, generated code or property access.
export type AngleMode = "deg" | "rad";
export interface CalculationInput {
  expression: string;
  mode: AngleMode;
  variables: Record<string, number>;
  answer: number;
}
export interface Evaluation { value: number; variables: Record<string, number>; assignment?: string }
export const calculatorFunctions = ["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "cbrt", "abs", "ln", "log", "exp", "floor", "ceil", "round", "min", "max"];
const reserved = new Set([...calculatorFunctions, "pi", "e", "tau", "ans"]);
export function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(Number(value.toPrecision(15)));
}
export function evaluateCalculation(input: CalculationInput): Evaluation {
  if (input.expression.length > 1024) throw new Error("Use at most 1,024 characters per expression.");
  if (!["deg", "rad"].includes(input.mode)) throw new Error("Choose DEG or RAD.");
  if (!Number.isFinite(input.answer) || Object.keys(input.variables).length > 64 || Object.entries(input.variables).some(([name, value]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(name) || reserved.has(name) || !Number.isFinite(value))) throw new Error("Invalid variable context (maximum 64 variables).");
  const source = input.expression.replaceAll("π", "pi").replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-").trim();
  const tokens: string[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|([a-zA-Z][a-zA-Z0-9_]*)|([+\-*/^!%(),=]))/y;
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unexpected character at position ${offset + 1}.`);
    tokens.push(match[0].trim()); offset = pattern.lastIndex;
    if (tokens.length > 512) throw new Error("Expression is too complex.");
  }
  if (!tokens.length) throw new Error("Enter an expression.");
  let cursor = 0, depth = 0;
  let assignment: string | undefined;
  if (/^[a-zA-Z]/.test(tokens[0]) && tokens[1] === "=") {
    assignment = tokens[0]; cursor = 2;
    if (assignment.length > 32 || reserved.has(assignment)) throw new Error("Choose a variable name other than a function or constant (up to 32 characters).");
  }
  const finite = (n: number) => { if (!Number.isFinite(n)) throw new Error("Result is outside the finite real-number domain (check division, roots, logs or overflow)."); return n; };
  const angle = input.mode === "deg" ? Math.PI / 180 : 1;
  function call(name: string, args: number[]): number {
    if (!calculatorFunctions.includes(name)) throw new Error(`Unknown function: ${name}.`);
    if (name === "min" || name === "max") {
      if (!args.length) throw new Error(`${name} needs at least one argument.`);
      return finite(name === "min" ? Math.min(...args) : Math.max(...args));
    }
    if (args.length !== 1) throw new Error(`${name} needs one argument.`);
    const x = args[0];
    switch (name) {
      case "sin": return finite(Math.sin(x * angle));
      case "cos": return finite(Math.cos(x * angle));
      case "tan": if (Math.abs(Math.cos(x * angle)) < 1e-14) throw new Error("Tangent is undefined at this angle."); return finite(Math.tan(x * angle));
      case "asin": return finite(Math.asin(x) / angle);
      case "acos": return finite(Math.acos(x) / angle);
      case "atan": return finite(Math.atan(x) / angle);
      case "sqrt": return finite(Math.sqrt(x));
      case "cbrt": return finite(Math.cbrt(x));
      case "abs": return Math.abs(x);
      case "ln": return finite(Math.log(x));
      case "log": return finite(Math.log10(x));
      case "exp": return finite(Math.exp(x));
      case "floor": return Math.floor(x);
      case "ceil": return Math.ceil(x);
      default: return Math.round(x);
    }
  }
  function expression(minimum = 0): number {
    if (++depth > 64) throw new Error("Use fewer nested operations (maximum 64).");
    const token = tokens[cursor++];
    let left: number;
    if (token === "+" || token === "-") left = (token === "-" ? -1 : 1) * expression(25);
    else if (token === "(") { left = expression(); if (tokens[cursor++] !== ")") throw new Error("Missing closing parenthesis."); }
    else if (token && /^(\d|\.)/.test(token)) left = finite(Number(token));
    else if (token && /^[a-zA-Z]/.test(token)) {
      if (calculatorFunctions.includes(token) && tokens[cursor] === "(") {
        cursor++; const args: number[] = [];
        if (tokens[cursor] !== ")") { args.push(expression()); while (tokens[cursor] === ",") { cursor++; args.push(expression()); } }
        if (tokens[cursor++] !== ")") throw new Error("Missing closing parenthesis in function.");
        left = call(token, args);
      } else {
        const constants: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, ans: input.answer };
        const value = Object.hasOwn(constants, token) ? constants[token] : Object.hasOwn(input.variables, token) ? input.variables[token] : undefined;
        if (value === undefined) throw new Error(`Unknown variable: ${token}. Define it with ${token}=…`);
        left = value;
      }
    } else throw new Error("Expected a number, variable or parenthesized expression.");
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      if ((op === "!" || op === "%") && 40 >= minimum) {
        cursor++;
        if (op === "%") left /= 100;
        else {
          if (!Number.isInteger(left) || left < 0 || left > 170) throw new Error("Factorial needs an integer from 0 to 170.");
          let product = 1; for (let i = 2; i <= left; i++) product *= i; left = product;
        }
        continue;
      }
      const implicit = op === "(" || /^[a-zA-Z]/.test(op);
      const precedence = op === "+" || op === "-" ? 10 : op === "*" || op === "/" || implicit ? 20 : op === "^" ? 30 : -1;
      if (precedence < minimum) break;
      if (!implicit) cursor++;
      const right = expression(op === "^" ? precedence : precedence + 1);
      left = finite(op === "+" ? left + right : op === "-" ? left - right : op === "/" ? left / right : op === "^" ? left ** right : left * right);
    }
    depth--; return finite(left);
  }
  const value = expression();
  if (cursor !== tokens.length) throw new Error(`Unexpected token: ${tokens[cursor]}.`);
  const variables = { ...input.variables };
  if (assignment) Object.defineProperty(variables, assignment, { value, enumerable: true, writable: true, configurable: true });
  if (Object.keys(variables).length > 64) throw new Error("Start a new worksheet to use more than 64 variables.");
  return { value, variables, assignment };
}
