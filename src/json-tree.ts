import { parseTree, printParseErrorCode, type Node, type ParseError } from "jsonc-parser";
export type JsonRow = { pointer: string; label: string; depth: number; start: number; length: number; type: string; parent: string | null; children: boolean };
export function inspectJson(text: string): { rows: JsonRow[]; error: string; truncated: boolean } {
  if (text.length > 1_000_000) return { rows: [], error: "Explore JSON up to 1,000,000 characters.", truncated: false };
  if (!text.trim()) return { rows: [], error: "Paste JSON to explore it.", truncated: false };
  try {
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
    if (errors.length || !root) {
      const error = errors[0];
      const before = text.slice(0, error?.offset ?? 0).split("\n");
      return { rows: [], error: `${printParseErrorCode(error?.error ?? 4)} at line ${before.length}, column ${before.at(-1)!.length + 1}.`, truncated: false };
    }
    const rows: JsonRow[] = [];
    const stack: { node: Node; pointer: string; label: string; depth: number; parent: string | null }[] = [{ node: root, pointer: "", label: "$", depth: 0, parent: null }];
    let omitted = false;
    while (stack.length && rows.length < 2000) {
      const entry = stack.pop()!;
      const node = entry.node;
      const children = node.type === "object" || node.type === "array";
      rows.push({ pointer: entry.pointer, label: entry.label, depth: entry.depth, parent: entry.parent, start: node.offset, length: node.length, type: node.type, children });
      const childrenList = node.children ?? [];
      if (childrenList.length > 2001) omitted = true;
      const entries = childrenList.slice(0, 2001).map((child, index) => {
        const key = node.type === "object" ? String(child.children![0].value) : String(index);
        return { node: node.type === "object" ? child.children![1] : child, pointer: `${entry.pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, label: key, depth: entry.depth + 1, parent: entry.pointer };
      });
      if (children) for (const child of entries.reverse()) stack.push(child);
    }
    return { rows, error: "", truncated: omitted || stack.length > 0 };
  } catch { return { rows: [], error: "JSON is too deeply nested or cannot be parsed.", truncated: false }; }
}
