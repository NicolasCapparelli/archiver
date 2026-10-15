export interface TextMatch { start: number; end: number }

/** Literal, case-insensitive matches, with offsets in the original UTF-16 text. */
export function findText(text: string, query: string): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  return Array.from(text.matchAll(pattern), match => ({ start: match.index!, end: match.index! + match[0].length }));
}

export function nextMatch(index: number, delta: number, count: number) {
  return count ? ((index + delta) % count + count) % count : 0;
}
