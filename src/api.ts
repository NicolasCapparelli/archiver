import { invoke, isTauri } from "@tauri-apps/api/core";
export interface Item {
  id: string;
  kind: string;
  text: string;
  source: string;
  timestamp: number;
  firstSeen: number;
  occurrences: number;
  pinned: boolean;
  directory: string;
  formats: string[];
  bytes: number;
  name?: string;
  title?: string;
  collections?: string[];
  note?: string;
  ocrMatch?: { excerpt: string; start: number; end: number; fuzzy: boolean };
  exitCode?: number | null;
  successful?: boolean | null;
  durationMs?: number | null;
  failures?: number;
}
export interface Status {
  paused: boolean;
  clipboard: string;
  shells: string[];
  error: string | null;
  dataPath: string;
}
export interface Stats {
  items: number;
  occurrences: number;
  bytes: number;
  commands: number;
}
export interface Preferences {
  shortcut: string;
  excludedApps: string[];
  recoveryHours?: number;
  ocrIntervalSeconds?: number;
  ocrOnCapture?: boolean;
  librarianStateMemory?: boolean;
}
export interface SearchOptions {
  source?: string;
  directory?: string;
  kind?: string;
  from?: number | null;
  until?: number | null;
  pinned?: boolean | null;
  session?: string;
  tag?: string;
  collection?: string;
  fuzzy?: boolean;
  libraryOnly?: boolean;
}
let previewPreferences: Preferences = {
  shortcut: "Ctrl+Super+Period",
  excludedApps: [],
};
export async function preferences(): Promise<Preferences> {
  return native ? invoke("app_settings") : previewPreferences;
}
export async function savePreferences(settings: Preferences) {
  if (native) await invoke("save_settings", { settings });
  else previewPreferences = settings;
}
export async function archive() {
  if (native) await invoke("show_archive");
  else location.search = "";
}
export const native = isTauri();
const now = Date.now();
const sample = (
  id: string,
  kind: string,
  text: string,
  source: string,
  minutes: number,
  extra: Partial<Item> = {},
): Item => ({
  id,
  kind,
  text,
  source,
  timestamp: now - minutes * 60_000,
  firstSeen: now - minutes * 60_000,
  occurrences: 1,
  pinned: false,
  directory: "",
  formats: kind === "command" ? [] : ["CF_UNICODETEXT"],
  bytes: text.length * 2,
  ...extra,
});
let examples: Item[] = [
  sample(
    "1",
    "command",
    "git log --oneline --graph --decorate -12",
    "PowerShell 7",
    3,
    { directory: "C:\\Projects\\archiver", occurrences: 4 },
  ),
  sample(
    "2",
    "text",
    "Everything you copied. Every command you entered.\nA little less remembering. A lot more finding.",
    "Notepad",
    12,
    { pinned: true, occurrences: 2 },
  ),
  sample("3", "text", "https://www.sqlite.org/fts5.html", "Firefox", 27),
  sample(
    "4",
    "command",
    "cargo test --manifest-path src-tauri/Cargo.toml",
    "CMD",
    42,
    { directory: "C:\\Projects\\archiver" },
  ),
  sample(
    "5",
    "rich",
    "The archive is a record of motion: small moments, preserved.",
    "Notes",
    80,
    { formats: ["CF_UNICODETEXT", "HTML Format"] },
  ),
  sample(
    "6",
    "command",
    "Get-ChildItem -Recurse -Filter *.rs",
    "PowerShell 7",
    125,
    { directory: "C:\\Projects\\archiver", pinned: true },
  ),
  sample(
    "7",
    "text",
    "SELECT item_id, COUNT(*) FROM events GROUP BY item_id;",
    "Visual Studio Code",
    150,
  ),
];
let previewPaused = false;
const previewLibrary = new Set(examples.map((item) => item.id));
let previewClearSnapshot: string[] = [];
export async function undoLibraryClear(): Promise<number> {
  if (native) return invoke("undo_library_clear");
  let count = 0;
  for (const id of previewClearSnapshot) {
    if (examples.some(i => i.id === id) && !previewLibrary.has(id)) { previewLibrary.add(id); count++; }
  }
  return count;
}
export async function clearLibrary(): Promise<number> {
  if (native) return invoke("clear_library");
  const count = previewLibrary.size;
  if (count) previewClearSnapshot = [...previewLibrary];
  previewLibrary.clear();
  return count;
}
export async function restoreLibrary(id: string) {
  if (native) await invoke("restore_library_item", { id });
  else previewLibrary.add(id);
}
export async function pasteRecent(count: number) {
  if (!native) throw new Error("Recent-clip paste is available in the Windows app");
  await invoke("paste_recent", { count });
}
export async function list(
  query: string,
  filter: string,
  offset = 0,
  directory = "",
  options: SearchOptions = {},
): Promise<Item[]> {
  if (native)
    return invoke("list_items", { query, filter, offset, directory, options });
  return examples
    .filter(
      (i) =>
        (!options.libraryOnly || previewLibrary.has(i.id) || !!i.name) &&
        ((filter === "all" && !i.name) ||
          (filter === "snippets" && !!i.name) ||
          (filter === "failed" && !!i.failures) ||
          (filter === "pinned" && i.pinned) ||
          (filter === "clips" && i.kind !== "command") ||
          i.kind === filter) &&
        `${i.name || ""} ${i.title || ""} ${i.text} ${i.directory} ${i.source}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!options.source ||
          i.source.toLowerCase().includes(options.source.toLowerCase())) &&
        (!options.directory ||
          i.directory
            .toLowerCase()
            .includes(options.directory.toLowerCase())) &&
        (!options.kind || i.kind === options.kind) &&
        (options.pinned == null || i.pinned === options.pinned) &&
        (options.from == null || i.timestamp >= options.from) &&
        (options.until == null || i.firstSeen < options.until) &&
        (!options.collection || i.collections?.includes(options.collection)),
    )
    .sort((a, b) =>
      directory
        ? Number(b.directory === directory) - Number(a.directory === directory)
        : 0,
    )
    .slice(offset, offset + 50);
}
export async function stats(): Promise<Stats> {
  return native
    ? invoke("archive_stats")
    : {
        items: examples.length,
        occurrences: examples.reduce((s, i) => s + i.occurrences, 0),
        bytes: examples.reduce((s, i) => s + i.bytes, 0),
        commands: examples
          .filter((i) => i.kind === "command")
          .reduce((s, i) => s + i.occurrences, 0),
      };
}
export async function status(): Promise<Status> {
  return native
    ? invoke("capture_status")
    : {
        paused: previewPaused,
        clipboard: "Browser preview · capture unavailable",
        shells: [],
        error: null,
        dataPath: "Sample data · changes last only in this preview",
      };
}
export async function collectionGroups(): Promise<string[]> {
  return native ? invoke("collection_groups") : JSON.parse(localStorage.getItem("archiver-preview-groups") || "[]");
}
export async function renameItem(id: string, title: string) {
  if (native) await invoke("rename_item", { id, title });
  else examples = examples.map(item => item.id === id ? { ...item, title: title.trim() } : item);
}
export async function pin(id: string, pinned: boolean) {
  if (native) await invoke("pin_item", { id, pinned });
  else examples = examples.map((i) => (i.id === id ? { ...i, pinned } : i));
}
export async function remove(id: string) {
  if (native) await invoke("delete_item", { id });
  else examples = examples.filter((i) => i.id !== id);
}
export async function pause(paused: boolean) {
  if (native) await invoke("pause_capture", { paused });
  else previewPaused = paused;
}
export async function copy(item: Item, plain = false, prepared?: string) {
  if (native)
    await invoke("copy_item", {
      id: item.id,
      text: prepared ?? item.text,
      plain: plain || prepared !== undefined,
    });
  else await navigator.clipboard.writeText(prepared ?? item.text);
}
export async function quick() {
  if (native) await invoke("show_quick");
}
export async function paste(item: Item, plain = false, prepared?: string) {
  if (!native) throw new Error("Paste requires the Windows desktop app.");
  await invoke("paste_item", {
    id: item.id,
    plain: plain || prepared !== undefined,
    prepared: prepared ?? null,
  });
}
export async function destination(): Promise<string> {
  return native ? invoke("paste_destination") : "Desktop app required";
}
// Generated text shares replay/delivery commands without a stored item.
export async function deliverEmoji(text: string, paste = false) {
  if (!text) throw new Error("Select an emoji first");
  if (paste) {
    if (!native) throw new Error("Paste requires the Windows desktop app.");
    await invoke("paste_item", { id: null, plain: true, prepared: text });
  } else if (native) await invoke("copy_item", { id: null, text, plain: true });
  else await navigator.clipboard.writeText(text);
}
export interface ShellSession {
  protocolVersion?: number;
  session: string;
  source: string;
  pid: number;
  directory: string;
  ready: boolean;
  insertion: boolean;
  updatedAt: number;
}
export async function sessions(): Promise<ShellSession[]> {
  return native ? invoke("shell_sessions") : [];
}
export async function insert(item: Item, session: string, prepared?: string) {
  if (!native) throw new Error("Insertion requires the Windows desktop app.");
  if (!session) throw new Error("Choose a connected shell session first.");
  await invoke("insert_command", {
    id: item.id,
    session,
    prepared: prepared ?? null,
  });
}
export interface ImagePreview {
  url: string;
  width: number;
  height: number;
}
export async function imagePreview(
  id: string,
  thumbnail = true,
): Promise<ImagePreview> {
  if (!native)
    throw new Error(
      "Image previews require a captured image in the desktop app.",
    );
  return invoke("image_preview", { id, thumbnail });
}
export async function saveSnippet(
  id: string | undefined,
  name: string,
  kind: string,
  text: string,
  note = "",
  collection?: string,
): Promise<string> {
  if (native)
    return invoke("save_snippet", { id: id ?? null, name, kind, text, note, collection: collection || null });
  if (!name.trim() || !text) throw new Error("Name and content are required.");
  if (
    examples.some(
      (item) =>
        item.name?.toLowerCase() === name.trim().toLowerCase() &&
        item.id !== id,
    )
  )
    throw new Error("A snippet already uses this name.");
  const key = id ?? `snippet:${crypto.randomUUID()}`;
  const old = examples.find((item) => item.id === key);
  examples = examples.filter((item) => item.id !== key);
  examples.push(
    sample(key, kind, text, "Named snippet", 0, {
      name: name.trim(),
      note,
      collections: [...new Set([...(old?.collections || []), ...(collection ? [collection] : [])])],
      firstSeen: old?.firstSeen ?? Date.now(),
      pinned: old?.pinned ?? false,
      occurrences: 0,
    }),
  );
  return key;
}
export async function saveTextClip(
  text: string,
  destination: "library" | "archive",
): Promise<string> {
  if (native) return invoke("save_text_clip", { text, destination });
  if (!text.trim()) throw new Error("Nothing to save");
  examples = [
    sample(`text:${crypto.randomUUID()}`, "text", text, "Paste Playground", 0),
    ...examples,
  ];
  return "preview";
}
export async function setQuickExpanded(expanded: boolean) {
  if (native) await invoke("set_quick_expanded", { expanded });
}
export async function overwriteClip(id: string, text: string) {
  if (native) return invoke("overwrite_clip", { id, text });
  if (!text) throw new Error("A clip cannot be empty");
  examples = examples.map((item) => (item.id === id ? { ...item, text } : item));
}

export interface StatisticCount { name: string; count: number }
export interface ArchiveStatistics {
  counts: { snippets: number; pins: number; library: number; sources: number; copies: number; firstCapture: number | null; lastCapture: number | null };
  groups: number; kinds: StatisticCount[]; sources: StatisticCount[];
}
export async function archiveStatistics(): Promise<ArchiveStatistics> {
  if (native) return invoke("archive_statistics");
  const count = (rows: Item[], key: "kind" | "source") => [...new Set(rows.map(i => i[key]))].map(name => ({ name, count: rows.filter(i => i[key] === name).length }));
  const history = examples.filter(i => !i.name);
  return { counts: { snippets: examples.filter(i => i.name).length, pins: examples.filter(i => i.pinned).length, library: previewLibrary.size, sources: new Set(history.map(i => i.source)).size, copies: history.reduce((n, i) => n + i.occurrences, 0), firstCapture: history.length ? Math.min(...history.map(i => i.firstSeen)) : null, lastCapture: history.length ? Math.max(...history.map(i => i.timestamp)) : null }, groups: (await collectionGroups()).length, kinds: count(history, "kind"), sources: count(history, "source") };
}
export async function renameCollection(old: string, name: string) {
  if (native) return invoke("rename_collection", { old, new: name });
  name = name.trim();
  const groups = await collectionGroups();
  if (!name || new TextEncoder().encode(name).length > 100 || name.includes(",")) throw new Error("Use a group name of 1–100 bytes without commas.");
  if (groups.some(group => group.toLowerCase() === name.toLowerCase() && group.toLowerCase() !== old.toLowerCase())) throw new Error("A group with that name already exists.");
  examples = examples.map(item => ({ ...item, collections: item.collections?.map(group => group.toLowerCase() === old.toLowerCase() ? name : group) }));
  localStorage.setItem("archiver-preview-groups", JSON.stringify(groups.map(group => group.toLowerCase() === old.toLowerCase() ? name : group)));
}
