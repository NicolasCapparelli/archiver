import { diffLines } from "./text-diff.ts";
export type DiffCell = { text: string; line: number; kind: "same" | "add" | "remove" };
export type DiffRow = { left?: DiffCell; right?: DiffCell };
export function compareSides(left: string, right: string, baseline: "left" | "right") {
  const result = diffLines(baseline === "left" ? left : right, baseline === "left" ? right : left);
  const rows: DiffRow[] = [];
  let index = 0;
  while (index < result.lines.length) {
    const line = result.lines[index];
    if (line.kind === "same") {
      rows.push({ left: { ...line, line: 0 }, right: { ...line, line: 0 } }); index++; continue;
    }
    const removed: string[] = [], added: string[] = [];
    while (index < result.lines.length && result.lines[index].kind !== "same") {
      const next = result.lines[index++];
      (next.kind === "remove" ? removed : added).push(next.text);
    }
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      const before = removed[i] === undefined ? undefined : { text: removed[i], line: 0, kind: "remove" as const };
      const after = added[i] === undefined ? undefined : { text: added[i], line: 0, kind: "add" as const };
      rows.push(baseline === "left" ? { left: before, right: after } : { left: after, right: before });
    }
  }
  // Number after mapping back to physical left/right sides.
  let l = 0, r = 0;
  for (const row of rows) { if (row.left) row.left.line = ++l; if (row.right) row.right.line = ++r; }
  return { rows, coarse: result.coarse };
}
/** Unicode-safe shared edges; the middle is the changed span, including line endings. */
export function changedSpan(text: string, other: string) {
  const a = Array.from(text), b = Array.from(other);
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - end - 1] === b[b.length - end - 1]) end++;
  return [a.slice(0, start).join(""), a.slice(start, a.length - end).join(""), a.slice(a.length - end).join("")];
}
