import hljs from "highlight.js/lib/core";
import powershell from "highlight.js/lib/languages/powershell";
import dos from "highlight.js/lib/languages/dos";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import xml from "highlight.js/lib/languages/xml";
import plaintext from "highlight.js/lib/languages/plaintext";
const grammars = {
  powershell,
  dos,
  bash,
  json,
  sql,
  javascript,
  typescript,
  python,
  rust,
  xml,
};
export const languages = Object.keys(grammars);
hljs.registerLanguage("plaintext", plaintext);
for (const [name, grammar] of Object.entries(grammars))
  hljs.registerLanguage(name, grammar);
export function highlight(
  text: string,
  kind: string,
  source: string,
  choice: string,
): { value: string; language?: string } {
  const code = text.slice(0, 30000);
  if (choice === "plain")
    return hljs.highlight(code, { language: "plaintext" });
  if (choice !== "auto" && languages.includes(choice))
    return hljs.highlight(code, { language: choice, ignoreIllegals: true });
  if (kind === "command")
    return hljs.highlight(code, {
      language: /powershell/i.test(source)
        ? "powershell"
        : /cmd|clink/i.test(source)
          ? "dos"
          : "bash",
      ignoreIllegals: true,
    });
  try {
    JSON.parse(code);
    return hljs.highlight(code, { language: "json" });
  } catch {}
  if (
    /^\s*(select|insert\s+into|update|delete\s+from|create\s+(table|index|view)|with)\b[\s\S]*\b(from|into|set|table|values|as)\bb/i.test(
      code,
    )
  )
    return hljs.highlight(code, { language: "sql", ignoreIllegals: true });
  const result = hljs.highlightAuto(code, languages);
  return result.relevance >= 3
    ? result
    : hljs.highlight(code, { language: "plaintext" });
}
