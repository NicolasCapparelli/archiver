import type { Item } from "./api";
export function OcrMatch({ match }: { match: NonNullable<Item["ocrMatch"]> }) {
  return <span className="ocr-match" aria-label={match.fuzzy ? "Recognized text, approximate match" : "Recognized text match"}>
    <small>{match.fuzzy ? "OCR · approximate: " : "OCR: "}</small>
    {match.excerpt.slice(0, match.start)}<mark>{match.excerpt.slice(match.start, match.end)}</mark>{match.excerpt.slice(match.end)}
  </span>;
}
