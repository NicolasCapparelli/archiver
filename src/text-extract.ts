export type ExtractKind = "urls" | "emails" | "paths" | "regex";
export type ExtractRequest = { text: string; kind: ExtractKind; pattern: string; flags: string; unique: boolean };
export function extractText({ text, kind, pattern, flags, unique }: ExtractRequest) {
  if (text.length > 100000) throw new Error("Extract from up to 100,000 characters at a time.");
  let regex: RegExp;
  switch (kind) {
    case "urls": regex = /https?:\/\/[^\s<>"']+/giu; break;
    case "emails": regex = /(?<![\w.+-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/giu; break;
    case "paths": regex = /(?<![\w:/\\])(?:"((?:[A-Z]:[\\/]|\\\\|\/)[^"\r\n]+)"|'((?:[A-Z]:[\\/]|\\\\|\/)[^'\r\n]+)'|((?:[A-Z]:[\\/]|\\\\)[^\s<>"'|]+|\/(?:[\w.~@%+()-]+\/)*[\w.~@%+()-]+))/giu; break;
    case "regex":
      if (!pattern) throw new Error("Enter a regular expression.");
      if (pattern.length > 2000) throw new Error("Use a pattern of at most 2,000 characters.");
      if (!/^[imu]*$/.test(flags) || new Set(flags).size !== flags.length) throw new Error("Optional flags: i, m, u (once each).");
      regex = new RegExp(pattern, `g${flags}`); break;
    default: throw new Error("Unknown extractor.");
  }
  const values: string[] = [], seen = new Set<string>();
  let match: RegExpExecArray | null, scanned = 0, truncated = false;
  while ((match = regex.exec(text))) {
    if (++scanned > 10000) { truncated = true; break; }
    let value = kind === "paths" ? match[1] ?? match[2] ?? match[3] : match[0];
    if (kind === "urls") {
      value = value.replace(/[.,;:!?]+$/, "");
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
      }
    }
    if (value && (!unique || !seen.has(value))) {
      if (values.length >= 2000) { truncated = true; break; }
      values.push(value); seen.add(value);
    }
    if (!match[0]) {
      const code = text.codePointAt(regex.lastIndex);
      regex.lastIndex += regex.unicode && code !== undefined && code > 0xffff ? 2 : 1;
    }
  }
  return { values, truncated };
}
