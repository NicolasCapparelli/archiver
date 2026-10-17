import test from "node:test";
import assert from "node:assert/strict";
import { inspectJson } from "../src/json-tree.ts";

test("JSON explorer preserves exact large numbers and escapes JSON Pointer keys", () => {
  const input = '{"a/b~c":[900719925474099312345,"🛰",null],"__proto__":{"ok":true}}';
  const result = inspectJson(input);
  assert.equal(result.error, "");
  const row = result.rows.find(row => row.pointer === "/a~1b~0c/0")!;
  assert.equal(input.slice(row.start, row.start + row.length), "900719925474099312345");
  assert.ok(result.rows.some(row => row.pointer === "/__proto__/ok"));
  assert.equal(result.rows[0].pointer, "");
  assert.equal(result.rows.find(row => row.pointer === "/a~1b~0c")!.parent, "");
});
test("JSON explorer rejects invalid JSON/comments/trailing commas and bounds wide/deep inputs", () => {
  for (const value of ["", '{"x":}', '[1,]', '{/*comment*/"x":1}', 'true false']) assert.ok(inspectJson(value).error);
  const large = inspectJson(JSON.stringify(Array.from({ length: 50000 }, (_, i) => i)));
  assert.equal(large.rows.length, 2000);
  assert.equal(large.truncated, true);
  assert.ok(inspectJson("x".repeat(1_000_001)).error);
  const deep = inspectJson("[".repeat(20000) + "0" + "]".repeat(20000));
  assert.ok(deep.error || deep.truncated);
});
