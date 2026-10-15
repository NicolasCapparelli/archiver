import test from "node:test";
import assert from "node:assert/strict";
import { transform, placeholders, renderTemplate } from "../src/text-tools.ts";
test("transformations preserve Unicode and report invalid encodings/JSON", () => {
  assert.equal(transform(" \n 🛰 \t", "trim"), "🛰");
  assert.equal(transform("Hello", "upper"), "HELLO");
  assert.equal(transform("HELLO", "lower"), "hello");
  assert.equal(transform('{"x":1}', "json"), '{\n  "x": 1\n}');
  assert.equal(
    transform("https%3A%2F%2Fexample.com%2Fa%20b+q", "url"),
    "https://example.com/a b+q",
  );
  assert.throws(() => transform("%GG", "url"));
  assert.throws(() => transform("bad", "json"));
  const numeric = transform(
    '{"n":9007199254740993,"s":"\\u2604","n":1e100}',
    "json",
  );
  assert.ok(numeric.includes("9007199254740993"));
  assert.ok(numeric.includes('"\\u2604"'));
  assert.ok(numeric.includes("1e100"));
});
test("templates reuse values literally without evaluating commands or replacement syntax", () => {
  const text =
    "{{project:archiver}} {{project}} {{command}} {{__proto__:safe}}";
  const values = placeholders(text);
  assert.equal(values.project, "archiver");
  assert.equal(values.__proto__, "safe");
  values.command = "$(danger) $& 日本語\n";
  assert.equal(
    renderTemplate(text, values),
    "archiver archiver $(danger) $& 日本語\n safe",
  );
  assert.equal(renderTemplate("{{value:a:b}}", {}), "a:b");
});
