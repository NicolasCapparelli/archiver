// Read-only metadata diagnostics. Never prints clipboard text or payload bytes.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const database = path.join(process.env.LOCALAPPDATA, 'app.archiver.desktop', 'archive.sqlite3');
const source = process.argv[2] ?? 'waveform-cli.exe';
const db = new DatabaseSync(database, { readOnly: true });
const rows = db.prepare(`SELECT i.kind, i.pinned, length(i.text) AS textLength,
  min(e.first_seen) AS firstCaptured, max(e.last_seen) AS lastCaptured,
  count(*) AS occurrences,
  (SELECT group_concat(format, ' | ') FROM representations WHERE item_id=i.id) AS formats,
  (SELECT sum(length(data)) FROM representations WHERE item_id=i.id) AS bytes
  FROM items i JOIN events e ON e.item_id=i.id
  WHERE i.id IN (SELECT item_id FROM events WHERE source = ? COLLATE NOCASE)
  AND (? = '' OR i.kind = ?)
  GROUP BY i.id ORDER BY lastCaptured DESC LIMIT 10`).all(source, process.argv[3] ?? '', process.argv[3] ?? '');
console.log(JSON.stringify({ source, rows }, null, 2));
db.close();
