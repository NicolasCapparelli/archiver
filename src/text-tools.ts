import { format, applyEdits } from "jsonc-parser";
export type Transformation = "trim" | "upper" | "lower" | "json" | "url";
export function transform(text: string, kind: Transformation): string {
  switch (kind) {
    case "trim":
      return text.trim();
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "json":
      JSON.parse(text);
      return applyEdits(
        text,
        format(text, undefined, { tabSize: 2, insertSpaces: true, eol: "\n" }),
      );
    case "url":
      return decodeURIComponent(text);
  }
}
const pattern = /\{\{([A-Za-z_][\w-]*)(?::([^{}]*))?\}\}/g;
export function placeholders(text: string): Record<string, string> {
  const values: Record<string, string> = Object.create(null);
  for (const match of text.matchAll(pattern)) {
    if (!Object.hasOwn(values, match[1])) values[match[1]] = match[2] ?? "";
    if (Object.keys(values).length > 64)
      throw new Error("Templates support up to 64 different placeholders.");
  }
  return values;
}
export function renderTemplate(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(pattern, (_, name: string, fallback: string) =>
    Object.hasOwn(values, name) ? values[name] : (fallback ?? ""),
  );
}
