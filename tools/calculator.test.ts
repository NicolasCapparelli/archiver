import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCalculation, formatNumber } from "../src/calculator-engine.ts";
import { argumentHint, completions, emptyDraft, expressionToLatex, insertionLatex, latexToExpression, readDraft, recallHistory } from "../src/calculator-editing.ts";

test("keypad operators remain insertable and function completion supplies paired math templates", () => {
  for (const key of ["+", "-", ")", ",", "=", ".", "!", "7", "ans", "pi"]) assert.doesNotThrow(() => insertionLatex(key), key);
  assert.equal(insertionLatex("%"), String.raw`\%`);
  assert.equal(insertionLatex("*"), String.raw`\cdot `);
  assert.equal(insertionLatex("/"), String.raw`\frac{#@}{#?}`);
  assert.equal(insertionLatex("sqrt("), String.raw`\sqrt{#?}`);
  assert.equal(insertionLatex("cbrt("), String.raw`\sqrt[3]{#?}`);
  assert.equal(insertionLatex("sin("), String.raw`\operatorname{sin}\left(#?\right)`);
});

test("structured fractions, powers and roots retain real-number meaning without executing TeX", () => {
  const values: [string, number][] = [[String.raw`\frac{1+2}{\sqrt{9}}`, 1], [String.raw`2^{3^{2}}`, 512], [String.raw`\sqrt[3]{-8}`, -2], [String.raw`\sqrt[4]{16}`, 2], [String.raw`\operatorname{sin}\left(30\right)`, .5], [String.raw`50\%\cdot80`, 40]];
  for (const [latex, expected] of values) assert.ok(Math.abs(evaluate(latexToExpression(latex)).value - expected) < 1e-12, latex);
  for (const latex of [String.raw`\frac{1}{\placeholder{}}`, String.raw`\href{bad}{1}`, String.raw`\input{file}`, "{".repeat(80), "a".repeat(8193)]) assert.throws(() => latexToExpression(latex));
  assert.throws(() => evaluate(latexToExpression(String.raw`\frac{1}{}`)));
});
test("archive expressions round-trip through math source including named variables and percent", () => {
  for (const source of ["radius=3", "2pi*radius", "ans/2", "asin(0.5)", "floor(2.5)", "cbrt(-8)", "min(2,3)", "50%*80", "x_2+1", "1e-3", "1+2/3", "2^3^2", "-2^2", "(-2)^2", "2(3+4)", "π×2−1", "8÷2"]) {
    const context = { mode: "deg" as const, variables: { radius: 3, x_2: 2 }, answer: 4 };
    assert.deepEqual(evaluateCalculation({ ...context, expression: latexToExpression(expressionToLatex(source)) }), evaluateCalculation({ ...context, expression: source }), source);
  }
  assert.match(expressionToLatex("1/2"), /\\frac/);
  assert.match(expressionToLatex("sqrt(9)"), /\\sqrt/);
});
test("draft recovery validates version, size, finite context and reserved variables", () => {
  const draft = { ...emptyDraft(), latex: String.raw`\frac{radius}{`, mode: "rad" as const, variables: { radius: 3 }, answer: 9, lastResult: 9 };
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft);
  assert.deepEqual(readDraft(null), emptyDraft());
  for (const value of [{ ...draft, version: 2 }, { ...draft, variables: { sin: 1 } }, { ...draft, mode: "bad" }, { ...draft, answer: "4" }, { ...draft, lastResult: "4" }, { ...draft, latex: "x".repeat(8193) }, { ...draft, variables: [] }]) assert.throws(() => readDraft(JSON.stringify(value)));
  assert.throws(() => readDraft("{broken"));
});
test("Up/Down recall preserves the original unfinished draft and its entire working context", () => {
  const draft = { ...emptyDraft(), latex: "radius+", variables: { radius: 12 }, answer: 4, lastResult: 4, mode: "rad" as const };
  const rows = [{ calculation: { expression: "radius*2", variables: { radius: 3 }, answer: 1, mode: "deg" as const } }, { calculation: { expression: "1+2", variables: {}, answer: 0, mode: "rad" as const } }];
  const first = recallHistory({ index: -1, draft: null }, 1, draft, rows);
  assert.deepEqual(first.draft.variables, { radius: 3 }); assert.equal(first.draft.mode, "deg");
  const second = recallHistory(first.state, 1, { ...first.draft, latex: "edited" }, rows);
  assert.equal(second.state.index, 1);
  assert.equal(recallHistory(second.state, 1, second.draft, rows).state.index, 1);
  const back = recallHistory(second.state, -1, second.draft, rows);
  assert.deepEqual(recallHistory(back.state, -1, back.draft, rows).draft, draft);
  assert.deepEqual(recallHistory({ index: -1, draft: null }, 1, draft, []).draft, draft);
});
test("function and variable completion stays bounded and argument hints follow nested calls", () => {
  assert.deepEqual(completions("sq", {}), ["sqrt"]);
  assert.deepEqual(completions("rad", { radius: 3 }), ["radius"]);
  assert.deepEqual(completions("sin", {}), ["sin"]);
  assert.ok(completions("a", {}).length <= 6);
  assert.equal(argumentHint("min(2,sin(30"), "sin(value) · argument 1");
  assert.equal(argumentHint("min(2,sin(30),"), "min(value, …) · argument 3");
  assert.equal(argumentHint("sin(30)"), "");
});
import { clearVisibleCalculations, isCalculationVisible, readVisibility, revealNewCalculation } from "../src/calculator-visibility.ts";
const evaluate = (expression: string, mode: "deg" | "rad" = "deg", variables: Record<string, number> = {}, answer = 0) => evaluateCalculation({ expression, mode, variables, answer });
test("local clear survives preference reload without changing permanent calculations", () => {
  const archive = [{ id: "one", timestamp: 100 }, { id: "two", timestamp: 200 }];
  const original = structuredClone(archive);
  const hidden = readVisibility(JSON.stringify(clearVisibleCalculations(archive, 200)));
  assert.deepEqual(archive.filter(row => isCalculationVisible(row, hidden)), []);
  assert.deepEqual(archive, original);
  assert.equal(isCalculationVisible({ id: "older-page", timestamp: 50 }, hidden), false);
  assert.equal(isCalculationVisible({ id: "next", timestamp: 201 }, hidden), true);
  for (const timestamp of [200, 150]) {
    const next = { id: `new-${timestamp}`, timestamp };
    const revealed = readVisibility(JSON.stringify(revealNewCalculation(next, hidden)));
    assert.equal(isCalculationVisible(next, revealed), true, "new rows survive timestamp ties and backwards clocks");
    assert.equal(isCalculationVisible(archive[0], revealed), false);
    assert.equal(isCalculationVisible(next, clearVisibleCalculations([...archive, next], 200)), false);
  }
});
test("missing or invalid visibility preferences leave the archive visible", () => {
  for (const raw of [null, "{", "null", '{"through":-1,"exceptions":[]}', '{"through":200,"exceptions":[3]}']) {
    assert.equal(isCalculationVisible({ id: "one", timestamp: 100 }, readVisibility(raw)), true);
  }
  const future = { id: "imported", timestamp: 9999 };
  assert.equal(isCalculationVisible(future, clearVisibleCalculations([future], 200)), false);
});
test("scientific grammar respects precedence, right powers, implicit multiplication and numeric notation", () => {
  for (const [expression, expected] of [["2+3*4", 14], ["-2^2", -4], ["(-2)^2", 4], ["2^3^2", 512], ["2^-3", .125], ["2(3+4)", 14], ["2pi", 2*Math.PI], ["1e3+2.5E-2", 1000.025], ["5!", 120], ["50%*80", 40], ["π×2−1", 2*Math.PI-1], ["min(3,2,8)+max(1,9)", 11], ["sqrt(81)+log(100)+ln(e)", 12]] as const) assert.equal(evaluate(expression).value, expected, expression);
  assert.ok(Math.abs(evaluate("sin(30)").value - .5) < 1e-14);
  assert.ok(Math.abs(evaluate("sin(pi/2)", "rad").value - 1) < 1e-14);
  assert.ok(Math.abs(evaluate("asin(0.5)").value - 30) < 1e-12);
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(.1+.2), "0.3");
});
test("variables and ans use immutable saved context so later changes cannot alter a saved result", () => {
  const original = {};
  const first = evaluate("radius=3", "deg", original);
  assert.deepEqual(original, {});
  assert.deepEqual(first.variables, { radius: 3 });
  assert.equal(evaluate("2pi*radius+ans", "rad", first.variables, 10).value, 6*Math.PI+10);
  assert.equal(evaluate("radius=7", "deg", first.variables).variables.radius, 7);
  assert.equal(first.variables.radius, 3);
  assert.throws(() => evaluate("pi=3"));
  assert.throws(() => evaluate("x=1", "deg", Object.fromEntries(Array.from({length:64}, (_, i) => [`v${i}`, i]))));
});
test("invalid/domain/overflow/hostile inputs fail within grammar bounds", () => {
  assert.throws(() => evaluate("1.2.3"));
  assert.throws(() => evaluate("1 2"));
  for (const expression of ["", "1/0", "sqrt(-1)", "ln(0)", "tan(90)", "171!", "(-1)!", "2.5!", "foo(2)", "1+", "(2+3", "sin()", "sin(1,2)", "2=3", "1);alert(1)", "globalThis.process.exit()", "constructor(1)", "1e999", "9^999", "(".repeat(65)+"1"+")".repeat(65), "1".repeat(1025)]) assert.throws(() => evaluate(expression), undefined, expression);
});
