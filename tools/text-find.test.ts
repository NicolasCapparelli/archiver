import test from "node:test";
import assert from "node:assert/strict";
import { findText, nextMatch } from "../src/text-find.ts";

test("find treats punctuation and markup literally and retains original Unicode offsets", () => {
  assert.deepEqual(findText("😨 <a>.*\n<a>.*", "<A>.*"), [{ start: 3, end: 8 }, { start: 9, end: 14 }]);
  assert.deepEqual(findText("x [a] \\ $ ^", "[a]"), [{ start: 2, end: 5 }]);
  assert.deepEqual(findText("one\nTWO one\ntwo", "one\ntwo"), [{ start: 0, end: 7 }, { start: 8, end: 15 }]);
  assert.deepEqual(findText("anything", ""), []);
  assert.deepEqual(findText("anything", "missing"), []);
});
test("find traverses every match in either direction and wraps safely", () => {
  assert.equal(nextMatch(2, 1, 3), 0);
  assert.equal(nextMatch(0, -1, 3), 2);
  assert.equal(nextMatch(0, 1, 0), 0);
  assert.equal(findText("X ".repeat(20000), "x").length, 20000);
});
