import { test } from "node:test";
import { strict as assert } from "node:assert";
import { diffLines } from "../src/text-diff.ts";
test("diff preserves both inputs, Unicode, CRLF and final newlines", () => {
  for (const [a, b] of [
    ["", "hello"],
    ["hello", ""],
    ["🛰\r\nold\n", "🛰\r\nnew"],
    ["same", "same\n"],
    ["a\nb\nc", "a\nx\nc"],
  ]) {
    const result = diffLines(a, b);
    assert.equal(
      result.lines
        .filter((l) => l.kind !== "add")
        .map((l) => l.text)
        .join(""),
      a,
    );
    assert.equal(
      result.lines
        .filter((l) => l.kind !== "remove")
        .map((l) => l.text)
        .join(""),
      b,
    );
    assert.equal(result.coarse, false);
  }
});
test("large diffs remain bounded and reconstruct inputs", () => {
  const a = "before\n".repeat(1000),
    b = "after\n".repeat(1000);
  const result = diffLines(a, b);
  assert.equal(result.coarse, true);
  assert.equal(
    result.lines
      .filter((l) => l.kind !== "add")
      .map((l) => l.text)
      .join(""),
    a,
  );
  assert.equal(
    result.lines
      .filter((l) => l.kind !== "remove")
      .map((l) => l.text)
      .join(""),
    b,
  );
  assert.throws(() => diffLines("x".repeat(100001), ""), /100,000/);
});
