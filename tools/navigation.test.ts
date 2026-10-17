import test from "node:test";
import assert from "node:assert/strict";
import { nextIndex, navigationKey, shortcutFromKey, isArchivistShortcut } from "../src/navigation.ts";
import { snippetGroups, groupCollapsed } from "../src/snippet-groups.ts";
import type { Item } from "../src/api.ts";

test("new and ungrouped sections default closed while explicit search/memory state is respected", () => {
  for (const name of ["Work", "", "New group"]) assert.equal(groupCollapsed(name, null), true);
  assert.equal(groupCollapsed("Work", []), false);
  assert.equal(groupCollapsed("Work", ["Work"]), true);
  assert.equal(groupCollapsed("Personal", ["Work"]), false);
});

test("snippet groups follow user collections across types, preserve empty groups and put ungrouped last", () => {
  const rows = [
    { id: "a", kind: "text", collections: ["Work", "work", "Personal"] },
    { id: "b", kind: "command", collections: ["Work"] },
    { id: "c", kind: "text", collections: [] },
  ] as Item[];
  const grouped = snippetGroups(rows, ["Work", "Empty", "Personal"]);
  assert.deepEqual(grouped.map(g => [g.name, g.items.map(i => i.id)]), [["Empty", []], ["Personal", ["a"]], ["Work", ["a", "b"]], ["", ["c"]]]);
  assert.deepEqual(snippetGroups(rows, [], "WORK").map(g => g.items.map(i => i.id)), [["a", "b"]]);
  assert.deepEqual(snippetGroups([], ["Empty"]).map(g => g.name), ["Empty"]);
});
test("Archivist uses Ctrl+Alt+O and leaves the retired chord alone", () => {
  const event = { key: "o", code: "KeyO", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
  assert.equal(isArchivistShortcut(event), true);
  assert.equal(isArchivistShortcut({ ...event, altKey: false, shiftKey: true }), false);
  assert.equal(isArchivistShortcut({ ...event, ctrlKey: false }), false);
  assert.equal(isArchivistShortcut({ ...event, metaKey: true }), false);
});
test("tabs wrap and result navigation stays within the list", () => {
  assert.equal(nextIndex(3, 1, 4, true), 0);
  assert.equal(nextIndex(0, -1, 4, true), 3);
  assert.equal(nextIndex(0, -1, 4), 0);
  assert.equal(nextIndex(3, 1, 4), 3);
  assert.equal(nextIndex(0, 1, 0), -1);
});
test("shortcut recorder handles Windows period, modifier-only and unmodified keys", () => {
  const event = {
    code: "Period",
    ctrlKey: true,
    metaKey: true,
    shiftKey: false,
    altKey: false,
  };
  assert.equal(shortcutFromKey(event), "Ctrl+Super+Period");
  assert.equal(shortcutFromKey({ ...event, code: "MetaLeft" }), null);
  assert.equal(
    shortcutFromKey({ ...event, ctrlKey: false, metaKey: false }),
    null,
  );
  assert.equal(
    shortcutFromKey({ ...event, code: "KeyJ", metaKey: false, altKey: true }),
    "Ctrl+Alt+KeyJ",
  );
});

test("WASD navigation never consumes typing, modifiers or Archivist editing", () => {
  const event = { key: "w", code: "KeyW", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  for (const [code, key] of [["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"], ["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]]) {
    assert.equal(navigationKey({ ...event, code }, true, false), key);
  }
  assert.equal(navigationKey(event, true, true), "w");
  assert.equal(navigationKey(event, false, false), "w");
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(navigationKey({ ...event, [modifier]: true }, true, false), "w");
});
