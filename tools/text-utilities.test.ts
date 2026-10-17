import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Worker } from "node:worker_threads";
import { compareSides, changedSpan } from "../src/diff-sides.ts";
import { extractText, type ExtractRequest } from "../src/text-extract.ts";
test("editable diff preserves physical sides and numbers when either side is baseline", () => {
  for (const [left, right] of [["🛰\r\nold\nlast", "🛰\r\nnew\nextra\nlast"], ["", "a\n"], ["a\n", ""], ["x", "x\n"], ["a\n".repeat(900), "b\n".repeat(900)]]) {
    for (const base of ["left", "right"] as const) {
      const { rows } = compareSides(left, right, base);
      for (const side of ["left", "right"] as const) {
        const cells = rows.flatMap(row => row[side] ? [row[side]!] : []);
        assert.equal(cells.map(cell => cell.text).join(""), side === "left" ? left : right);
        assert.deepEqual(cells.map(cell => cell.line), cells.map((_, i) => i + 1));
        assert(cells.every(cell => cell.kind === "same" || cell.kind === (side === base ? "remove" : "add")));
      }
    }
  }
  assert.deepEqual(changedSpan("🛰old\r\n", "🛰new\r\n"), ["🛰", "old", "\r\n"]);
  assert.throws(() => compareSides("x".repeat(100001), "", "left"));
});
const request = (kind: ExtractRequest["kind"], text: string, extra: Partial<ExtractRequest> = {}) => extractText({ kind, text, pattern: "", flags: "iu", unique: true, ...extra });
test("extractors preserve order, URL punctuation/balanced brackets, Unicode paths and duplicate policy", () => {
  assert.deepEqual(request("urls", "See (https://example.com/a), https://example.com/foo_(bar). https://example.com/a").values, ["https://example.com/a", "https://example.com/foo_(bar)"]);
  assert.deepEqual(request("emails", "A+B@example.com\r\nsecond@x.org A+B@example.com").values, ["A+B@example.com", "second@x.org"]);
  assert.deepEqual(request("paths", '"C:\\my folder\\🛰.txt" /tmp/a.txt \\\\server\\share\\a.txt').values, ["C:\\my folder\\🛰.txt", "/tmp/a.txt", "\\\\server\\share\\a.txt"]);
  assert.deepEqual(request("urls", "https://x.org https://x.org", { unique: false }).values, ["https://x.org", "https://x.org"]);
  assert.deepEqual(request("paths", "https://example.com/file").values, []);
});
test("custom extraction handles Unicode and empty matches and bounds work/results", () => {
  assert.deepEqual(request("regex", "ticket-42\r\nTICKET-99", { pattern: "ticket-\\d+" }).values, ["ticket-42", "TICKET-99"]);
  assert.deepEqual(request("regex", "🛰x", { pattern: "(?:)", flags: "u" }).values, []);
  assert.equal(request("regex", "x".repeat(3000), { pattern: "x", unique: false }).values.length, 2000);
  assert.equal(request("regex", "x".repeat(3000), { pattern: "x", unique: false }).truncated, true);
  assert.equal(request("regex", "x".repeat(12000), { pattern: "x" }).truncated, true);
  assert.throws(() => request("regex", "x", { pattern: "[" }));
  assert.throws(() => request("regex", "x", { pattern: "x", flags: "gg" }));
  assert.throws(() => request("urls", "x".repeat(100001)));
});
test("extract worker returns errors and can be terminated during catastrophic custom regex", async () => {
  // Adapt the production web-worker entry to worker_threads without a browser or UI access.
  const url = new URL("../src/extract-worker.ts", import.meta.url).href;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); globalThis.self = { postMessage: data => parentPort.postMessage(data) }; import(${JSON.stringify(url)}).then(() => { parentPort.on('message', data => self.onmessage({data})); parentPort.postMessage('ready'); });`, { eval: true });
  try {
    const next = () => new Promise<any>((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); });
    assert.equal(await next(), "ready");
    let response = next(); worker.postMessage({ kind: "regex", text: "x", pattern: "[", flags: "u", unique: true });
    assert.match((await response).error, /SyntaxError/);
    response = next(); worker.postMessage({ kind: "regex", text: "a".repeat(60) + "!", pattern: "(a+)+$", flags: "", unique: true });
    const outcome = await Promise.race([response.then(() => "finished"), new Promise(resolve => setTimeout(() => resolve("deadline"), 150))]);
    assert.equal(outcome, "deadline");
    await worker.terminate();
  } finally { await worker.terminate(); }
});
