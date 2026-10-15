import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
const executable = path.resolve("target/debug/archiverctl.exe");
test("local CLI imports idempotently, JSON stdio API searches/contributes, and shell bridge preserves input", () => {
  const root = mkdtempSync(path.resolve("target/cli-test-"));
  const run = (args, input = "") => {
    const r = spawnSync(executable, args, {
      input,
      encoding: "utf8",
      env: { ...process.env, ARCHIVER_DATA_DIR: root },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  try {
    const history = path.join(root, "history.txt");
    writeFileSync(
      history,
      "echo 🛰`\necho two\necho duplicate\necho duplicate\n",
    );
    assert.equal(
      JSON.parse(run(["import", history, "powershell"])).imported,
      3,
    );
    assert.equal(
      JSON.parse(run(["import", history, "powershell"])).imported,
      0,
    );
    writeFileSync(
      history,
      "echo 🛰`\necho two\necho duplicate\necho duplicate\necho duplicate\n",
    );
    assert.equal(
      JSON.parse(run(["import", history, "powershell"])).imported,
      1,
    );
    const capture = {
      kind: "text",
      text: "Agent contribution 🛰",
      source: "test agent",
      timestamp: 123,
    };
    const responses = run(
      ["serve"],
      [
        { id: 1, method: "contribute", params: capture },
        { id: 2, method: "search", params: { query: "contribution" } },
        { id: 3, method: "stats", params: {} },
        { id: 4, method: "unsupported", params: {} },
        { id: 5, method: "stats", params: {} },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(responses[0].result.captured, true);
    assert.equal(responses[1].id, 2);
    assert.equal(responses[1].result[0].text, capture.text);
    assert.equal(responses[2].result.occurrences, 5);
    assert.equal(responses[3].id, 4);
    assert.equal(responses[3].error, "Unknown API method");
    assert.equal(responses[4].id, 5);
    assert.equal(responses[4].result.occurrences, 5);
    const fuzzy = JSON.parse(
      run([
        "search",
        "contributon",
        "all",
        "0",
        JSON.stringify({
          fuzzy: true,
          source: "test agent",
          from: 123,
          until: 124,
        }),
      ]),
    );
    assert.equal(fuzzy[0].text, capture.text);
    assert.deepEqual(
      JSON.parse(
        run([
          "search",
          "contributon",
          "all",
          "0",
          JSON.stringify({ fuzzy: true, source: "other" }),
        ]),
      ),
      [],
    );
    const grouped = run(
      ["serve"],
      [
        {
          id: 6,
          method: "contribute",
          params: {
            kind: "command",
            text: "git status",
            source: "PS",
            timestamp: 200,
            directory: "/project",
            session: "test-session",
            sequence: 1,
          },
        },
        { id: 7, method: "sessions", params: {} },
        {
          id: 8,
          method: "search",
          params: {
            query: "",
            filter: "command",
            options: { session: "test-session" },
          },
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(grouped[0].result.captured, true);
    assert.equal(grouped[1].result[0].session, "test-session");
    assert.equal(grouped[2].result[0].text, "git status");
    assert.equal(
      JSON.parse(run(["session-timeline", "test-session"]))[0].sequence,
      1,
    );
    const existingCount = JSON.parse(run(["library", "stats"])).items;
    assert.ok(existingCount > 0);
    assert.equal(JSON.parse(run(["library", "clear"])).archived, existingCount);
    assert.deepEqual(
      JSON.parse(
        run(["search", "contribution", "all", "0", '{"libraryOnly":true}']),
      ),
      [],
    );
    const archiveItem = JSON.parse(run(["search", "contribution"]))[0];
    assert.equal(archiveItem.text, capture.text);
    run(["library", "restore", archiveItem.id]);
    const libraryApi = run(
      ["serve"],
      [
        { id: 9, method: "library_stats", params: {} },
        { id: 10, method: "clear_library", params: {} },
        {
          id: 11,
          method: "restore_library_item",
          params: { id: archiveItem.id },
        },
        {
          id: 12,
          method: "session_timeline",
          params: { session: "test-session", offset: 0 },
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(libraryApi[0].result.items, 1);
    assert.equal(libraryApi[1].result.archived, 1);
    assert.equal(libraryApi[2].result.restored, true);
    assert.equal(libraryApi[3].result[0].text, "git status");
    run(
      ["contribute"],
      JSON.stringify({
        kind: "image",
        text: "OCR fixture",
        source: "test",
        timestamp: 300,
      }),
    );
    const imageId = JSON.parse(run(["search", "OCR fixture", "image"]))[0].id;
    // Simulate an existing archive whose derived word index has not been built.
    const database = new DatabaseSync(path.join(root, "archive.sqlite3"));
    database
      .prepare(
        "INSERT INTO image_text(item_id,text,language,error,updated) VALUES(?,?,?,?,?)",
      )
      .run(imageId, "Orbital telescope 42", "en-US", "", 301);
    database.exec(
      "DELETE FROM search_meta; DELETE FROM item_terms; DELETE FROM fuzzy_keys; DELETE FROM terms;",
    );
    database.close();
    assert.equal(
      JSON.parse(
        run(["search", "contributon", "all", "0", '{"fuzzy":true}']),
      )[0].text,
      capture.text,
    );
    assert.equal(
      JSON.parse(run(["search", "telescope", "image"]))[0].id,
      imageId,
    );
    assert.equal(
      JSON.parse(run(["search", "telescop", "image", "0", '{"fuzzy":true}']))[0]
        .id,
      imageId,
    );
    assert.equal(
      JSON.parse(run(["read", imageId])).ocr.text,
      "Orbital telescope 42",
    );
    const session = run(["uuid"]).trim();
    const text = "echo '$HOME' 🛰\nline two\n";
    run(["begin", session, "1", "WSL / Bash", "12", "/work dir"], text);
    run(["finish", session, "1", "7"]);
    const events = readdirSync(path.join(root, "shell-spool")).map((p) =>
      JSON.parse(readFileSync(path.join(root, "shell-spool", p), "utf8")),
    );
    assert.equal(events.find((e) => e.kind === "command").text, text);
    assert.equal(events.find((e) => e.kind === "command_result").exitCode, 7);
    const id = run(["uuid"]).trim();
    const request = path.join(root, `insert-${session}.txt`);
    writeFileSync(
      request,
      `${id} ${Math.floor(Date.now() / 1000) + 3}\n${text}`,
    );
    assert.equal(run(["take", session]), `${id}\n${text}`);
    assert.equal(run(["take", session]), "");
    run(["ack", session, id]);
    assert.equal(readFileSync(`${request}.ack`, "utf8"), id);
    writeFileSync(path.join(root, "capture-state.json"), '{"paused":true}');
    run(["begin", session, "2", "WSL / Bash", "12", "/work"], text);
    assert.equal(readdirSync(path.join(root, "shell-spool")).length, 2);
  } finally {
    assert.ok(root.startsWith(path.resolve("target") + path.sep));
    rmSync(root, { recursive: true });
  }
});

test("library clear undo persists across CLI processes and stdio API preserves new captures", () => {
  const root = mkdtempSync(path.resolve("target/cli-undo-test-"));
  const run = (args, input = "") => {
    const r = spawnSync(executable, args, { input, encoding: "utf8", env: { ...process.env, ARCHIVER_DATA_DIR: root } });
    assert.equal(r.status, 0, r.stderr); return r.stdout;
  };
  const serve = requests => run(["serve"], requests.map(JSON.stringify).join("\n") + "\n").trim().split("\n").map(JSON.parse);
  try {
    serve([{ method: "contribute", params: { kind: "text", text: "before", source: "test", timestamp: 1 } }]);
    assert.equal(JSON.parse(run(["library", "clear"])).archived, 1);
    assert.equal(JSON.parse(run(["library", "clear"])).archived, 0);
    serve([{ method: "contribute", params: { kind: "text", text: "after", source: "test", timestamp: 2 } }]);
    const results = serve([{ method: "undo_library_clear", params: {} }, { method: "library_stats", params: {} }, { method: "stats", params: {} }]);
    assert.equal(results[0].result.restored, 1);
    assert.equal(results[1].result.items, 2);
    assert.equal(results[2].result.items, 2);
    assert.equal(JSON.parse(run(["library", "undo-clear"])).restored, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
