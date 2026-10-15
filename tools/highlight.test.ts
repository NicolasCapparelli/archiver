import test from "node:test";
import assert from "node:assert/strict";
import { highlight } from "../src/highlight-engine.ts";
test("highlighting detects JSON, covers SQL/shells, escapes markup, and bounds preview", () => {
  assert.equal(
    highlight('{"hello":1}', "text", "editor", "auto").language,
    "json",
  );
  assert.match(
    highlight("SELECT * FROM events", "text", "editor", "sql").value,
    /hljs-keyword/,
  );
  assert.equal(
    highlight("Get-ChildItem -Path .", "command", "PowerShell 7", "auto")
      .language,
    "powershell",
  );
  assert.equal(highlight("dir /s", "command", "CMD", "auto").language, "dos");
  const safe = highlight(
    '<img src=x onerror="danger()">',
    "text",
    "editor",
    "plain",
  ).value;
  assert.ok(!safe.includes("<img"));
  assert.ok(safe.includes("&lt;img"));
  assert.equal(
    highlight("x".repeat(40000), "text", "editor", "plain").value.length,
    30000,
  );
});
