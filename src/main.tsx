import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BarChart3,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Database,
  FileText,
  Layers,
  Pause,
  Pin,
  Play,
  Search,
  Settings,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import type { Item } from "./api";
import { ImageThumbnail, ImageDetail } from "./image-preview";
import { TextDiffTool } from "./text-diff-tool";
import { TextExtractTool } from "./text-extract-tool";
import { RegionOcr } from "./region-ocr";
import { JsonExplorer } from "./json-explorer";
import { ClipNotes } from "./clip-notes";
import {
  HistoryImport,
  IntegrationHealth,
  Timeline,
  RecoveryAndBackup,
} from "./archive-tools";
import { SelectionTools, removeQueuedItem } from "./selection-tools";
import { ResourcePreview, DomainGroups } from "./resource-preview";
import { SearchTools, ItemLabels } from "./search-tools";
import { ItemActions, RenamePin } from "./item-actions";
import { Statistics } from "./statistics";
import { snippetGroups, groupCollapsed } from "./snippet-groups";
import { ClipGroups } from "./clip-groups";
import { OcrMatch } from "./ocr-match";
import { BulkOrganization } from "./bulk-organization";
import { Lifecycle } from "./lifecycle";
import { CommandPalette, ShortcutReference } from "./command-palette";
const EmojiSelector = lazy(() => import("./emoji-selector").then(module => ({ default: module.EmojiSelector })));
import {
  SnippetEditor,
  TextWorkbench,
  TemplateDialog,
  type SnippetDraft,
} from "./snippets";
import { placeholders } from "./text-tools";
import { ToolDialog } from "./tool-dialog";
import { TransformPicker } from "./transform-picker";
import { ClipWorkbench } from "./clip-workbench";
import { ArchiverMark } from "./archiver-mark";
import { FeatureCatalog } from "./feature-catalog";
import { OcrSettings } from "./ocr-tools";
const Highlight = lazy(() => import("./highlight"));
import { nextIndex, navigationKey, isArchivistShortcut, shortcutFromKey, shortcutLabel } from "./navigation";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/instrument-serif/400.css";
import "./style.css";

const isQuick = new URLSearchParams(location.search).has("quick");
const filters = [
  { id: "all", label: "All history", icon: Layers },
  { id: "clips", label: "Clipboard", icon: Clipboard },
  { id: "text", label: "Text", icon: FileText },
  { id: "image", label: "Images", icon: Clipboard },
  { id: "files", label: "Files", icon: Archive },
  { id: "command", label: "Commands", icon: Terminal },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "snippets", label: "Snippets", icon: FileText },
  { id: "failed", label: "Failed commands", icon: Terminal },
  { id: "links", label: "URLs", icon: ArrowUpRight },
];
const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
function relative(t: number) {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return m === 0
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : new Date(t).toLocaleDateString();
}
const itemIcon = (i: Item) =>
  i.kind === "command" ? Terminal : i.kind === "rich" ? FileText : Clipboard;
function App() {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<api.Stats>({
    items: 0,
    occurrences: 0,
    bytes: 0,
    commands: 0,
  });
  const [status, setStatus] = useState<api.Status | null>(null),
    [settings, setSettings] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("archiver-theme") || "dark",
  );
  const [preferences, setPreferences] = useState<api.Preferences>({
    shortcut: "Ctrl+Super+Period",
    excludedApps: [],
  });
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [knownGroups, setKnownGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [shortcutDraft, setShortcutDraft] = useState("Ctrl+Super+Period");
  const [exclusionsDraft, setExclusionsDraft] = useState("");
  const [destination, setDestination] = useState("");
  const [sessions, setSessions] = useState<api.ShellSession[]>([]);
  const [shellSession, setShellSession] = useState("");
  const [snippetDraft, setSnippetDraft] = useState<SnippetDraft>();
  const [renamePin, setRenamePin] = useState<Item>();
  const [groupAction, setGroupAction] = useState<"create" | "move" | "rename">();
  const [prepared, setPrepared] = useState<string>();
  const [basket, setBasket] = useState<Item[]>([]);
  const [searchOptions, setSearchOptions] = useState<api.SearchOptions>({});
  const activeFilters = Object.entries(searchOptions).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      (value !== false || key === "pinned"),
  ).length;
  const [collapsedSnippets, setCollapsedSnippets] = useState<string[] | null>(null);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [libraryCleared, setLibraryCleared] = useState(false);
  const groups = snippetGroups(items, query ? [] : knownGroups, searchOptions.collection);
  const orderedItems = (rows: Item[]) => filter === "snippets" ? [...new Map(snippetGroups(rows, [], searchOptions.collection).flatMap(group => group.items).map(item => [item.id, item])).values()] : rows;
  const visibleItems = filter === "snippets" ? [...new Map(groups.filter(group => !groupCollapsed(group.name, collapsedSnippets)).flatMap(group => group.items).map(item => [item.id, item])).values()] : items;
  const listRef = useRef<HTMLDivElement>(null);
  const resultButton = (id: string | null | undefined) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(".entry") || []).filter(row => row.dataset.itemId === id && !row.closest("[hidden]"));
    return rows.find(row => row.classList.contains("selected")) ?? rows[0];
  };
  const restoreState = useRef<{ selected: string | null; scroll: number; count: number; group: string } | null>(null);
  const restoringScroll = useRef(false);
  const browsingState = useRef({ filter, query, searchOptions, includeArchive: false, collapsedSnippets, selected, group: selectedGroup, scroll: 0, count: 50, shellSession });
  const resetOnRefresh = useRef(isQuick);
  const focusResultsAfterRefresh = useRef(false);
  const bottomRequest = useRef(false);
  const jumpGeneration = useRef(0);
  const [jumping, setJumping] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [includeArchive, setIncludeArchive] = useState(false);
  const scopedOptions = {
    ...searchOptions,
    libraryOnly: isQuick && !includeArchive,
  };
  const [toolDialog, setToolDialog] = useState<
    "filters" | "selection" | undefined
  >();
  const [regionId, setRegionId] = useState<string>();
  const [noteId, setNoteId] = useState<string>();
  const [textUtility, setTextUtility] = useState<{ kind: "diff" | "extract"; text: string }>();
  const [jsonText, setJsonText] = useState<string>();
  const [transformOpen, setTransformOpen] = useState(false);
  const [clipView, setClipView] = useState<null | {
    mode: "clip" | "playground";
    expanded: boolean;
    highlight?: boolean;
    draft?: { text: string; lang: string };
    item?: { id: string; kind: string; source: string; text: string };
  }>(null);
  const snapshot = () =>
    active
      ? {
          id: active.id,
          kind: active.kind,
          source: active.source,
          text: prepared ?? active.text,
        }
      : undefined;
  const expandedView = isQuick && clipView?.expanded === true;
  useEffect(() => {
    if (!expandedView) return;
    void api.setQuickExpanded(true).catch(() => {});
    return () => void api.setQuickExpanded(false).catch(() => {});
  }, [expandedView]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const contextDirectory =
    isQuick && filter === "command"
      ? sessions.find((session) => session.session === shellSession)
          ?.directory || ""
      : "";
  useEffect(() => {
    setPrepared(undefined);
    setTemplateDialog(false);
  }, [selected]);
  const input = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [rows, counts, health, preferences, destination, sessions, collectionGroups] =
        await Promise.all([
          api.list(query, filter, 0, contextDirectory, {
            ...searchOptions,
            libraryOnly: isQuick && !includeArchive,
          }),
          api.stats(),
          api.status(),
          api.preferences(),
          api.destination(),
          api.sessions(),
          api.collectionGroups(),
        ]);
      if (request !== generation.current) return;
      if (filter === "snippets") {
        while (rows.length > 0 && rows.length % 50 === 0) {
          const page = await api.list(query, filter, rows.length, contextDirectory, { ...searchOptions, libraryOnly: isQuick && !includeArchive });
          if (request !== generation.current) return;
          rows.push(...page); if (page.length < 50) break;
        }
      }
      const restore = restoreState.current;
      if (restore) {
        while (rows.length < restore.count && rows.length % 50 === 0 && rows.length > 0) {
          const page = await api.list(query, filter, rows.length, contextDirectory, { ...searchOptions, libraryOnly: isQuick && !includeArchive });
          if (request !== generation.current) return;
          rows.push(...page); if (page.length < 50) break;
        }
      }
      setKnownGroups(collectionGroups);
      setItems(rows);
      setMore(filter !== "snippets" && rows.length > 0 && rows.length % 50 === 0);
      setStats(counts);
      setStatus(health);
      setPreferences(preferences);
      setDestination(destination);
      setSessions(sessions);
      setShellSession((previous) =>
        sessions.some((session) => session.session === previous)
          ? previous
          : (sessions.find((session) => session.ready && session.insertion)
              ?.session ?? ""),
      );
      setError("");
      const resetSelection = resetOnRefresh.current;
      const rowGroups = snippetGroups(rows, collectionGroups, searchOptions.collection);
      const firstRow = filter === "snippets" ? rowGroups.find(group => group.items.length && !groupCollapsed(group.name, collapsedSnippets))?.items[0] : rows[0];
      setSelected((previous) =>
        !resetSelection && rows.some((i) => i.id === (restore?.selected ?? previous)) ? (restore?.selected ?? previous) : (firstRow?.id ?? null),
      );
      if (!restore && (resetSelection || !rows.some(item => item.id === browsingState.current.selected))) {
        setSelectedGroup(rowGroups.find(group => group.items.some(item => item.id === firstRow?.id))?.name ?? "");
      } else if (!restore && !rowGroups.some(group => group.name === browsingState.current.group && group.items.some(item => item.id === browsingState.current.selected))) {
        setSelectedGroup(rowGroups.find(group => group.items.some(item => item.id === browsingState.current.selected))?.name ?? "");
      }
      if (restore) {
        restoreState.current = null;
        setSelectedGroup(restore.group);
        requestAnimationFrame(() => {
          const heading = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(".snippet-group-toggle") || []).find(button => button.dataset.group === restore.group);
          (resultButton(restore.selected) ?? heading ?? listRef.current)?.focus({ preventScroll: true });
          listRef.current?.scrollTo({ top: restore.scroll });
          requestAnimationFrame(() => { restoringScroll.current = false; });
        });
      }
      if (resetOnRefresh.current) {
        resetOnRefresh.current = false;
        listRef.current?.scrollTo({ top: 0 });
        if (isQuick && document.activeElement !== input.current && !document.activeElement?.closest(".filter-bar") && !document.querySelector("dialog[open]")) focusResultsAfterRefresh.current = true;
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [query, filter, contextDirectory, searchOptions, includeArchive]);
  useEffect(() => {
    if (!focusResultsAfterRefresh.current) return;
    focusResultsAfterRefresh.current = false;
    if (!document.querySelector("dialog[open]") && document.activeElement !== input.current && !document.activeElement?.closest(".filter-bar"))
      (resultButton(selected) ?? listRef.current)?.focus();
  }, [items, selected]);
  useEffect(() => {
    if (settings) {
      setShortcutDraft(preferences.shortcut);
      setExclusionsDraft(preferences.excludedApps.join("\n"));
    }
  }, [settings]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), query ? 90 : 0);
    return () => clearTimeout(timer);
  }, [refresh, query]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: light)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "light" : "dark") : theme; };
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("archiver-theme", theme);
    const sync = (event: StorageEvent) => { if (event.key === "archiver-theme") setTheme(["dark", "light", "system"].includes(event.newValue || "") ? event.newValue! : "dark"); };
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", apply); window.removeEventListener("storage", sync); };
  }, [theme]);
  useEffect(() => {
    if (!api.native) return;
    let stop: undefined | (() => void);
    let disposed = false;
    void listen("archive-changed", () => void refresh()).then((fn) => {
      if (disposed) fn();
      else stop = fn;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [refresh]);
  browsingState.current = { filter, query, searchOptions, includeArchive, collapsedSnippets, selected, group: selectedGroup, scroll: listRef.current?.scrollTop ?? 0, count: items.length || 50, shellSession };
  useEffect(() => {
    if (!api.native) return;
    let disposed = false, stop: undefined | (() => void);
    void listen<string>("recent-paste-error", ({ payload }) => setToast(payload)).then(fn => { if (disposed) fn(); else stop = fn; });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (!api.native || !isQuick) return;
    let disposed = false, stop: undefined | (() => void), focusEpoch = 0;
    const handleFocus = ({ payload }: { payload: boolean }) => {
      const epoch = ++focusEpoch;
      if (payload) {
        void api.preferences().then(prefs => {
          if (disposed || epoch !== focusEpoch) return;
          ++generation.current;
          setPreferences(prefs);
          setClipView(null); setSnippetDraft(undefined); setRenamePin(undefined); setToolDialog(undefined); setTransformOpen(false); setTemplateDialog(false); setPalette(false); setShortcutsOpen(false); setOrganizationOpen(false); setConfirmDelete(false);
          setEmojiOpen(false); setRegionId(undefined); setNoteId(undefined); setJsonText(undefined); setTextUtility(undefined);
          let saved: typeof browsingState.current | null = null;
          if (prefs.librarianStateMemory) { try { saved = JSON.parse(localStorage.getItem("archiver-librarian-state") || "null"); } catch { /* A damaged browsing cache must not block opening. */ } }
          if (saved && filters.some(f => f.id === saved!.filter) && typeof saved.query === "string" && (saved.collapsedSnippets === null || Array.isArray(saved.collapsedSnippets))) {
            restoreState.current = { selected: saved.selected, scroll: Math.max(0, Number(saved.scroll) || 0), count: Math.max(50, Number(saved.count) || 50), group: saved.group || "" };
            resetOnRefresh.current = false;
            restoringScroll.current = true;
            setShellSession(saved.shellSession || "");
            setFilter(saved.filter); setQuery(saved.query); setSearchOptions(saved.searchOptions || {}); setIncludeArchive(!!saved.includeArchive); setCollapsedSnippets(saved.collapsedSnippets);
          } else {
            localStorage.removeItem("archiver-librarian-state");
            restoreState.current = null; resetOnRefresh.current = true;
            restoringScroll.current = false;
            setFilter("all"); setQuery(""); setSearchOptions({}); setIncludeArchive(false); setCollapsedSnippets(null); setSelectedGroup(""); setShellSession("");
            listRef.current?.scrollTo({ top: 0 });
          }
          (document.activeElement as HTMLElement)?.blur(); listRef.current?.focus({ preventScroll: true });
        }).catch(e => setError(String(e)));
      } else {
        localStorage.setItem("archiver-librarian-state", JSON.stringify({ ...browsingState.current, scroll: listRef.current?.scrollTop ?? browsingState.current.scroll }));
        setClipView(view => view?.expanded ? null : view);
        void getCurrentWindow().hide();
      }
    };
    void getCurrentWindow().onFocusChanged(handleFocus).then(fn => {
      if (disposed) fn();
      else {
        stop = fn;
        void getCurrentWindow().isFocused().then(focused => { if (!disposed && focused && focusEpoch === 0) handleFocus({ payload: true }); });
      }
    });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const active = items.find((i) => i.id === selected);
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [selected]);
  const action = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      if (message) setToast(message);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };
  const copy = async (item: Item, plain = false) => {
    if (
      item.name &&
      Object.keys(placeholders(item.text)).length &&
      prepared === undefined
    ) {
      setTemplateDialog(true);
      return;
    }
    try {
      await api.copy(item, plain, prepared);
      setToast(plain ? "Copied as plain text" : "Copied to clipboard");
      if (isQuick && api.native) await getCurrentWindow().hide();
    } catch (e) {
      setError(String(e));
    }
  };
  const paste = async (item: Item, plain = false) => {
    if (
      item.name &&
      Object.keys(placeholders(item.text)).length &&
      prepared === undefined
    ) {
      setTemplateDialog(true);
      return;
    }
    try {
      if (item.kind === "command") {
        await api.insert(item, shellSession, prepared);
        setToast("Command inserted for editing · not executed");
      } else {
        await api.paste(item, plain, prepared);
        setToast("Paste sent to previous app");
      }
    } catch (e) {
      setError(String(e));
      if (api.native) {
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
      }
    }
  };
  async function clearVisibleLibrary() {
    await action(async () => {
      const count = await api.clearLibrary();
      if (isQuick) {
        setIncludeArchive(false);
        setQuery("");
      }
      setLibraryCleared(true);
      setToast(`Library cleared · ${count} items. Your archive history and named snippets stay available.`);
    });
  }
  async function undoClear() {
    await action(async () => {
      const count = await api.undoLibraryClear();
      setLibraryCleared(false);
      setToast(`Restored ${count} library items; newer captures are preserved.`);
    });
  }
  async function jumpToBottom() {
    if (bottomRequest.current) return;
    bottomRequest.current = true; setJumping(true);
    const request = generation.current;
    const jump = ++jumpGeneration.current;
    try {
      let rows = [...items], hasMore = more;
      while (hasMore) {
        const page = await api.list(query, filter, rows.length, contextDirectory, scopedOptions);
        if (request !== generation.current || jump !== jumpGeneration.current) return;
        rows = [...rows, ...page]; hasMore = page.length === 50;
      }
      if (request !== generation.current || jump !== jumpGeneration.current) return;
      rows = orderedItems(rows);
      setCollapsedSnippets([]); setItems(rows); setMore(false);
      const lastGroup = filter === "snippets" ? snippetGroups(rows, knownGroups, searchOptions.collection).filter(group => group.items.length).at(-1) : undefined;
      const lastItem = lastGroup?.items.at(-1) ?? rows.at(-1);
      setSelected(lastItem?.id ?? null);
      if (lastGroup) setSelectedGroup(lastGroup.name);
      requestAnimationFrame(() => {
        if (document.activeElement?.closest(".item-list")) resultButton(lastItem?.id)?.focus({ preventScroll: true });
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    } catch (e) { setError(String(e)); }
    finally { bottomRequest.current = false; setJumping(false); }
  }
  function snippetFromSelection() {
    if (active && active.kind !== "image" && active.kind !== "files") {
      setSnippetDraft({
        id: active.name ? active.id : undefined,
        name: active.name || "",
        note: active.note,
        kind: active.kind === "command" ? "command" : "text",
        text: prepared ?? active.text,
      });
    } else setSnippetDraft({ name: "", kind: "text", text: "" });
  }
  const sessionPicker = (
    <select
      aria-label="Destination shell session"
      value={shellSession}
      onChange={(event) => setShellSession(event.target.value)}
    >
      <option value="">Choose shell session</option>
      {sessions.map((session) => (
        <option
          key={session.session}
          value={session.session}
          disabled={!session.ready || !session.insertion}
        >
          {session.source} · {session.directory} · PID {session.pid}
          {!session.ready
            ? " · busy"
            : !session.insertion
              ? " · insertion unavailable"
              : ""}
        </option>
      ))}
    </select>
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (isArchivistShortcut(event)) {
        // Handled before any dialog/palette checks so it always opens Archivist.
        event.preventDefault();
        event.stopPropagation();
        void api.archive();
        return;
      }
      if (expandedView) {
        if (event.key === "Escape" && target.closest("[data-text-find-open]")) return;
        if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
          event.preventDefault();
          setClipView(null);
        }
        return;
      }
      if (document.querySelector("dialog[open]")) return;
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyJ") {
        event.preventDefault(); setEmojiOpen(true); return;
      }
      const openable =
        active && active.kind !== "image" && active.kind !== "files";
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "o" &&
        openable
      ) {
        event.preventDefault();
        setClipView({ mode: "clip", expanded: false, item: snapshot() });
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.code === "KeyL" && openable) {
        event.preventDefault();
        setClipView({ mode: "clip", expanded: isQuick, item: snapshot() });
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.code === "KeyN") {
        event.preventDefault();
        setClipView({ mode: "playground", expanded: isQuick });
        return;
      }
      if (target.closest(".command-palette,[role=menu]")) return;
      if (event.key === "F1") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "F2" && active && (active.name || active.pinned)) {
        event.preventDefault(); if (active.name) snippetFromSelection(); else setRenamePin(active); return;
      }
      if (event.ctrlKey && event.altKey && !event.shiftKey && !isQuick && filter === "snippets") {
        if (event.code === "KeyG") { event.preventDefault(); setGroupAction("create"); return; }
        if (event.code === "KeyM" && active?.name) { event.preventDefault(); setGroupAction("move"); return; }
      }
      if (event.ctrlKey && event.shiftKey) {
        if (event.code === "KeyG") { event.preventDefault(); setOrganizationOpen(true); return; }
        if (event.code === "KeyZ") { event.preventDefault(); void undoClear(); return; }
        if (event.key.toLowerCase() === "s") { event.preventDefault(); snippetFromSelection(); return; }
        if (event.key.toLowerCase() === "a" && isQuick) { event.preventDefault(); setIncludeArchive(v => !v); return; }
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          setToolDialog("filters");
          return;
        }
        if (event.key.toLowerCase() === "q") {
          event.preventDefault();
          setToolDialog("selection");
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          void clearVisibleLibrary();
          return;
        }
        if (event.key.toLowerCase() === "e") {
          event.preventDefault();
          if (active?.text) setTemplateDialog(true);
          return;
        }
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "t" &&
        active &&
        active.kind !== "image" &&
        active.kind !== "files"
      ) {
        event.preventDefault();
        if (active.name) setSnippetDraft({ id: active.id, name: active.name, note: active.note, kind: active.kind, text: active.text });
        else setTransformOpen(true);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setPalette(true);
        return;
      }
      const inSearch = target === input.current;
      const inResults = !!target.closest(".entry,.item-list");
      const inTabs = !!target.closest(".filter-bar");
      const editing = !!target.closest("input,textarea,select,[contenteditable=true]");
      const wasd = isQuick && !editing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      const navKey = navigationKey(event, isQuick, editing);
      const inListContext = inResults || (isQuick && (inSearch || target === document.body || (wasd && inTabs)));
      if (!settings && inListContext && !(filter === "snippets" && inResults) && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "PageUp" || event.key === "PageDown")) {
        event.preventDefault();
        if (event.key === "PageDown") void jumpToBottom();
        else {
          ++jumpGeneration.current;
          setCollapsedSnippets([]); setSelected(orderedItems(items)[0]?.id ?? null);
          listRef.current?.scrollTo({ top: 0 });
          if (inResults) requestAnimationFrame(() => { resultButton(orderedItems(items)[0]?.id)?.focus(); listRef.current?.scrollTo({ top: 0 }); });
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "," && !isQuick) {
        event.preventDefault();
        setStatisticsOpen(false); setSettings((value) => !value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === "Escape") {
        setSettings(false);
        setConfirmDelete(false);
        if (isQuick && api.native) void getCurrentWindow().hide();
      }
      if (isQuick && !settings && (event.ctrlKey || event.metaKey) && event.key === "Tab" && !event.altKey) {
        event.preventDefault();
        const tabs = [...document.querySelectorAll<HTMLButtonElement>(".filter-bar button")];
        const index = tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true");
        const next = tabs[nextIndex(index, event.shiftKey ? -1 : 1, tabs.length, true)];
        next?.click(); next?.focus(); return;
      }
      if (filter === "snippets" && !inTabs && inListContext && (!editing || inSearch) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (inSearch && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const current = target.closest<HTMLButtonElement>(".entry,.snippet-group-toggle");
        const section = current?.closest<HTMLElement>(".snippet-group");
        const heading = section?.querySelector<HTMLButtonElement>(".snippet-group-toggle");
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          if (heading) {
            const open = heading.getAttribute("aria-expanded") === "true";
            if ((event.key === "ArrowLeft" && open) || (event.key === "ArrowRight" && !open)) heading.click();
            if (event.key === "ArrowRight" && open && current === heading) section?.querySelector<HTMLButtonElement>(".entry")?.focus();
            else heading.focus();
          }
          if (heading) return;
        }
        if (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(navKey)) {
          event.preventDefault();
          const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(".snippet-group-toggle,.entry") || []).filter(button => !button.closest("[hidden]"));
          const index = current ? buttons.indexOf(current) : -1;
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : nextIndex(index, navKey === "PageDown" ? 10 : navKey === "PageUp" ? -10 : navKey === "ArrowDown" ? 1 : -1, buttons.length);
          const button = buttons[next];
          if (button?.dataset.itemId) {
            setSelected(button.dataset.itemId);
            setSelectedGroup(button.closest<HTMLElement>(".snippet-group")?.querySelector<HTMLElement>(".snippet-group-toggle")?.dataset.group ?? "");
          }
          requestAnimationFrame(() => { button?.focus(); button?.scrollIntoView({ block: "nearest" }); });
          return;
        }
        if (current?.classList.contains("snippet-group-toggle") && event.key === "Enter") { event.preventDefault(); current.click(); return; }
      }
      if (
        !settings &&
        (inTabs ||
          (isQuick && (inResults || (inSearch && !query) || target === document.body || (event.altKey && inSearch)))) &&
        (navKey === "ArrowLeft" || navKey === "ArrowRight")
      ) {
        const tabs = Array.from(
          document.querySelectorAll<HTMLButtonElement>(".filter-bar button"),
        );
        const index = tabs.findIndex(
          (tab) => tab.getAttribute("aria-selected") === "true",
        );
        const next =
          tabs[
            nextIndex(
              index,
              navKey === "ArrowRight" ? 1 : -1,
              tabs.length,
              true,
            )
          ];
        event.preventDefault();
        next?.click();
        if (inTabs) next?.focus();
        return;
      }
      if (
        !settings &&
        inListContext &&
        (navKey === "ArrowDown" ||
          navKey === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End")
      ) {
        if (inSearch && (event.key === "Home" || event.key === "End")) return;
        event.preventDefault();
        const index = visibleItems.findIndex((i) => i.id === selected);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? visibleItems.length - 1
              : nextIndex(
                  index,
                  navKey === "ArrowDown" ? 1 : -1,
                  visibleItems.length,
                );
        setSelected(visibleItems[next]?.id ?? null);
        if (filter === "snippets" && (inResults || inTabs || inSearch))
          listRef.current?.querySelector<HTMLButtonElement>(".snippet-group-toggle")?.focus();
        else if (inResults || (wasd && inTabs))
          resultButton(visibleItems[next]?.id)?.focus();
      }
      if (
        !settings &&
        (inResults || (isQuick && inSearch)) &&
        event.key === "Enter" &&
        active
      ) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) void paste(active, event.shiftKey);
        else void copy(active, event.shiftKey);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  });
  useEffect(() => {
    setConfirmDelete(false);
    if (selected && !restoringScroll.current)
      resultButton(selected)?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const loadMore = async () => {
    try {
      const current = generation.current;
      const rows = await api.list(
        query,
        filter,
        items.length,
        contextDirectory,
        scopedOptions,
      );
      if (current !== generation.current) return;
      setItems([...items, ...rows]);
      setMore(rows.length === 50);
    } catch (e) {
      setError(String(e));
    }
  };
  const renderItem = (item: Item, group?: string) => {
          const primary = group === undefined || groups.find(section => section.items.some(row => row.id === item.id))?.name === group;
          const chosen = selected === item.id && (group === undefined || selectedGroup === group);
          const Icon = itemIcon(item);
          return (
            <button
              id={primary ? `item-${item.id}` : `item-${item.id}-${encodeURIComponent(group!)}`}
              data-item-id={item.id}
              draggable={!isQuick && filter === "snippets"}
              onDragStart={event => { event.dataTransfer.setData("application/x-archiver-snippet", item.id); event.dataTransfer.effectAllowed = "move"; }}
              key={item.id}
              tabIndex={chosen ? 0 : -1}
              className={`entry ${chosen ? "selected" : ""}`}
              onClick={() => { setSelected(item.id); if (group !== undefined) setSelectedGroup(group); }}
              onFocus={() => { setSelected(item.id); if (group !== undefined) setSelectedGroup(group); }}
              onDoubleClick={() => void copy(item)}
              aria-label={`${item.kind}, ${item.text.slice(0, 100)}`}
            >
              <span className={`entry-icon ${item.kind}`}>
                {item.kind === "image" ? (
                  <ImageThumbnail id={item.id} />
                ) : (
                  <Icon size={18} />
                )}
              </span>
              <span className="entry-body">
                <span
                  className={`entry-title ${item.kind === "command" && !item.name && !item.title ? "mono" : ""}`}
                >
                  {item.name || item.title ||
                    item.text ||
                    `${item.kind} · ${item.formats.join(", ")}`}
                </span>
                {!isQuick && filter === "snippets" && item.note && <span className="vault-note-preview">{item.note}</span>}
                {!isQuick && item.name && <span className="snippet-memberships">{item.collections?.length ? item.collections.map(name => <span key={name} className="snippet-membership">{name}</span>) : <span className="snippet-membership ungrouped">Ungrouped</span>}</span>}
                {item.ocrMatch && <OcrMatch match={item.ocrMatch} />}
                <span className="entry-meta">
                  <span>
                    {item.kind === "rich" ? "Rich text" : item.kind} ·{" "}
                    {item.source || "Unknown source"}
                  </span>
                  {item.directory && (
                    <span className="directory">{item.directory}</span>
                  )}
                  {item.occurrences > 1 && <span>×{item.occurrences}</span>}
                  {!!item.failures && (
                    <span className="failed-status">
                      {item.failures} failed
                    </span>
                  )}
                  {item.durationMs != null && (
                    <span>{(item.durationMs / 1000).toFixed(2)}s</span>
                  )}
                </span>
              </span>
              <span className="entry-end">
                {item.pinned && <Pin size={12} />}
                <time>{relative(item.timestamp)}</time>
                {chosen && <ChevronRight size={13} />}
              </span>
            </button>
          );
  };
  const panel = (
    <>
      <div className="search-box">
        <Search size={18} />
        <input
          ref={input}
          autoFocus={false}
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (filter === "snippets") setCollapsedSnippets(e.target.value ? [] : null); }}
          placeholder={`Search ${filter === "all" ? "all history" : ({ clips: "clipboard", command: "commands", snippets: "snippets", pinned: "pinned items", failed: "failed commands", text: "text", image: "images", files: "files", links: "URLs" } as Record<string, string>)[filter]}${filter === "snippets" ? "" : isQuick && !includeArchive ? " in library" : " in archive"}…`}
          aria-label={
            isQuick && !includeArchive
              ? `Search ${filter} in library`
              : `Search ${filter} in archive`
          }
        />
        {isQuick && (
          <button
            className="archive-scope"
            aria-label={includeArchive ? "Switch back to library · Ctrl Shift A" : "Include archive results · Ctrl Shift A"}
            onClick={() => setIncludeArchive(!includeArchive)}
          >
            {includeArchive ? "Archive" : "Library"}
          </button>
        )}
        {query ? (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </div>
      {isQuick && <div
        className="filter-bar"
        role="tablist"
        aria-label="History categories"
      >
        {[
              { id: "all", label: "All" },
              { id: "clips", label: "Clips" },
              { id: "command", label: "Commands" },
              { id: "pinned", label: "Pinned" },
              { id: "snippets", label: "Snippets" },
              { id: "failed", label: "Failed" },
        ].map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            tabIndex={filter === f.id ? 0 : -1}
            className={filter === f.id ? "chip chosen" : "chip"}
            onClick={() => { if (f.id === "snippets") setCollapsedSnippets(query ? [] : null); setFilter(f.id); }}
          >
            {f.label}
          </button>
        ))}
        <span className="result-count">
          {items.length}
          {more ? "+" : ""} results
        </span>
      </div>}
      {!isQuick && <div className="results-summary">{items.length}{more ? "+" : ""} results</div>}
      {contextDirectory && (
        <div className="suggestion-context" title={contextDirectory}>
          Suggested for {contextDirectory}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {libraryCleared && <div className="library-undo" role="status">Library cleared. {isQuick ? <span><kbd>Ctrl Shift Z</kbd> undo</span> : <button className="text-action" onClick={() => void undoClear()}>Undo clear</button>}</div>}
      {jumping && <p role="status">Loading the bottom of the list…</p>}
      {!isQuick && filter === "snippets" && <ClipGroups selected={searchOptions.collection || ""} onSelect={collection => setSearchOptions({ ...searchOptions, collection })} onChanged={() => void refresh()} active={active?.name ? active : undefined} vault onAction={setGroupAction} action={groupAction} onClose={() => setGroupAction(undefined)} />}
      <div ref={listRef} tabIndex={-1} className={`item-list ${!isQuick && filter === "snippets" ? "vault-list" : ""}`} role="group" aria-label={filter === "snippets" ? "Snippet vault" : "History results"}>
        {filter === "snippets" ? groups.map(group => {
          const open = !groupCollapsed(group.name, collapsedSnippets);
          const id = `snippet-group-${group.name ? "named-" + encodeURIComponent(group.name) : "none"}`;
          return <section className="snippet-group" key={group.name}>
            <button className="snippet-group-toggle" data-group={group.name} aria-expanded={open} aria-controls={id} onClick={() => {
              setCollapsedSnippets(previous => open ? [...(previous ?? groups.map(group => group.name)), group.name] : (previous ?? groups.map(group => group.name)).filter(name => name !== group.name));
            }}><span>{open ? "▾" : "▸"} {group.name || "Ungrouped"}</span><span>{group.items.length}{more ? "+" : ""}</span></button>
            <div id={id} hidden={!open}>{group.items.map(item => renderItem(item, group.name))}{!group.items.length && <p className="snippet-group-empty">{query ? "No matching snippets" : "No snippets in this group yet"}</p>}</div>
          </section>;
        }) : items.map(item => renderItem(item))}
        {!loading && !error && items.length === 0 && (
          <div className="empty">
            <Archive size={40} />
            <h3>
              {filter === "snippets"
                ? query ? "No matching snippets" : searchOptions.collection ? "This group is ready for snippets" : "A home for the things you reuse"
                : query
                ? "No matching records"
                : isQuick && !includeArchive
                  ? "Your library is clear"
                  : "Your archive starts here"}
            </h3>
            <p>
              {filter === "snippets"
                ? query ? "Try another name or word from the content." : "Create a named snippet, add a note, and organize it into a group."
                : query
                ? "Try a different word or another filter."
                : isQuick && !includeArchive
                  ? "Your full history stays in the archive. Ctrl+Shift+A includes it here."
                  : api.native
                    ? "Copy something to begin. Connected shells add commands automatically."
                    : "This filter has no sample items."}
            </p>
            {!isQuick && filter === "snippets" && !query && <button className="primary" onClick={() => setSnippetDraft({ name: "", kind: "text", text: "" })}>Create a snippet</button>}
          </div>
        )}
        {loading && <div className="empty">Opening the archive…</div>}
        {more && (
          <button className="load-more" onClick={() => void loadMore()}>
            {filter === "snippets" ? "Load more snippets" : "Load more history"}
          </button>
        )}
      </div>
      {!isQuick && (
        <div className="history-tools">
          <button className="text-action" onClick={() => setClipView({ mode: "playground", expanded: false })}>Paste Playground</button>
          <button className="text-action" disabled={!active?.text || ["image", "files"].includes(active.kind)} onClick={() => active && setClipView({ mode: "clip", item: active, expanded: false })}>Full clip</button>
          <button
            className="text-action"
            onClick={() => setToolDialog("filters")}
          >
            Filters & searches {activeFilters > 0 && `· ${activeFilters}`}
          </button>
          <button
            className="text-action"
            onClick={() => setToolDialog("selection")}
          >
            Combine & queue {basket.length > 0 && `· ${basket.length}`}
          </button>
          <button
            className="text-action"
            disabled={
              !active || active.kind === "image" || active.kind === "files"
            }
            onClick={() => active?.name ? setSnippetDraft({ id: active.id, name: active.name, note: active.note, kind: active.kind, text: active.text }) : setTransformOpen(true)}
          >
            {active?.name ? "Edit snippet" : "Transform"} <kbd>Ctrl T</kbd>
          </button>
          <button
            className="text-action"
            aria-label="Command palette · Ctrl Shift P"
            onClick={() => setPalette(true)}
          >
            Actions <kbd>Ctrl Shift P</kbd>
          </button>
        </div>
      )}
      {!isQuick && filter === "links" && <DomainGroups onSelect={setQuery} />}
    </>
  );
  const workbench = (expanded: boolean) => clipView && <ClipWorkbench key={`${clipView.mode}-${expanded}`} mode={clipView.mode} itemId={clipView.item?.id} initialText={clipView.mode === "playground" ? "" : clipView.item?.text ?? ""} draftText={clipView.draft?.text} startLang={clipView.draft?.lang ?? (clipView.highlight ? "auto" : "plain")} kind={clipView.item?.kind ?? "text"} source={clipView.item?.source ?? ""} expanded={expanded} canExpand={isQuick} keyboardOnly={isQuick}
    onExpand={draft => setClipView({ ...clipView, expanded: true, draft })}
    onSaveSnippet={text => { const item = items.find(item => item.id === clipView.item?.id); setClipView(null); setSnippetDraft({ id: item?.name ? item.id : undefined, name: item?.name || "", note: item?.note, kind: clipView.item?.kind === "command" ? "command" : "text", text }); }} onToast={setToast} />;
  const dialogs = (<>
    {textUtility && <ToolDialog title={textUtility.kind === "diff" ? "Text diff" : "Text extractors"} tall onClose={() => setTextUtility(undefined)}>{textUtility.kind === "diff" ? <TextDiffTool initialText={textUtility.text} /> : <TextExtractTool initialText={textUtility.text} />}</ToolDialog>}
    {regionId && <RegionOcr key={regionId} id={regionId} onClose={() => setRegionId(undefined)} />}
    {noteId && <ClipNotes key={noteId} id={noteId} onClose={() => setNoteId(undefined)} onSaved={() => { setToast("Note saved"); void refresh(); }} />}
    {jsonText !== undefined && <ToolDialog title="JSON explorer" onClose={() => setJsonText(undefined)} tall><JsonExplorer text={jsonText} /></ToolDialog>}
    {emojiOpen && <Suspense fallback={<ToolDialog title="Emoji catalog" onClose={() => setEmojiOpen(false)}><p role="status">Loading emoji catalog…</p></ToolDialog>}><EmojiSelector quick={isQuick} onClose={() => setEmojiOpen(false)} onToast={setToast} /></Suspense>}
    {renamePin && <RenamePin item={renamePin} keyboardOnly={isQuick} onClose={() => setRenamePin(undefined)} onSaved={() => { setRenamePin(undefined); setToast("Pin renamed"); void refresh(); }} />}
    {organizationOpen && <ToolDialog title="Tags & collections" onClose={() => setOrganizationOpen(false)}><BulkOrganization items={items} active={active} onSaved={() => { setOrganizationOpen(false); setToast("Labels updated"); void refresh(); }} /><p>Browse labels using Filters & saved searches (Ctrl+Shift+F).</p></ToolDialog>}
    {shortcutsOpen && <ToolDialog title="Keyboard shortcuts" onClose={() => setShortcutsOpen(false)}><ShortcutReference />{isQuick && filter === "command" && <div className="shell-picker"><label>Destination shell session{sessionPicker}</label></div>}</ToolDialog>}
    {palette && <CommandPalette onClose={() => setPalette(false)} extraActions={[
      { label: "Open Archivist · Ctrl Alt O", run: () => void api.archive() },
      { label: "Search · Ctrl K", run: () => input.current?.focus() },
      { label: "All shortcuts · F1", run: () => setShortcutsOpen(true) },
      ...(active?.kind === "image" ? [{ label: "Region OCR · recognize selected image area", run: () => setRegionId(active.id) }] : []),
      ...(active && !active.name ? [{ label: "Edit clip notes", run: () => setNoteId(active.id) }] : []),
      { label: "Text diff · editable left and right", run: () => setTextUtility({ kind: "diff", text: prepared ?? active?.text ?? "" }) },
      { label: "Text extractors · URLs, emails, paths and regex", run: () => setTextUtility({ kind: "extract", text: prepared ?? active?.text ?? "" }) },
      { label: "JSON explorer · selected text", run: () => setJsonText(prepared ?? active?.text ?? "") },
      { label: "Emoji catalog · Ctrl Shift J", run: () => setEmojiOpen(true) },
      ...Array.from({ length: 9 }, (_, index) => ({ label: `Paste last ${index + 1} clips · Ctrl Win ${index + 1}`, run: () => void action(() => api.pasteRecent(index + 1), "Recent clips pasted") })),
      { label: "Filters & saved searches · Ctrl Shift F", run: () => setToolDialog("filters") },
      { label: "Combine clips & paste queue · Ctrl Shift Q", run: () => setToolDialog("selection") },
      { label: "Tags & collections · Ctrl Shift G", run: () => setOrganizationOpen(true) },
      { label: "Clear library · Ctrl Shift Backspace", run: () => void clearVisibleLibrary() },
      { label: "Undo library clear · Ctrl Shift Z", run: () => void undoClear() },
      { label: "Paste Playground · Ctrl Shift N", run: () => setClipView({ mode: "playground", expanded: isQuick }) },
      { label: "Top of list · PgUp", run: () => { setCollapsedSnippets([]); setSelected(orderedItems(items)[0]?.id ?? null); listRef.current?.scrollTo({ top: 0 }); } },
      { label: "Bottom of list · PgDn", run: () => void jumpToBottom() },
      ...(isQuick ? [{ label: "Toggle archive results · Ctrl Shift A", run: () => setIncludeArchive(v => !v) }] : filter === "snippets" ? [{ label: "New group · Ctrl Alt G", run: () => setGroupAction("create") }, { label: "Rename group", run: () => setGroupAction("rename") }, ...(active?.name ? [{ label: "Move selected to group · Ctrl Alt M", run: () => setGroupAction("move") }] : [])] : []),
      ...(active?.pinned && !active.name ? [{ label: "Rename pin · F2", run: () => setRenamePin(active) }] : []),
      ...(active && !["image", "files"].includes(active.kind) ? [
        { label: active.name ? "Edit snippet · Ctrl T" : "Transform & copy · Ctrl T", run: () => active.name ? snippetFromSelection() : setTransformOpen(true) },
        { label: "Open full clip · Ctrl O", run: () => setClipView({ mode: "clip", expanded: false, item: snapshot() }) },
        { label: "Expanded Librarian · Ctrl Shift L", run: () => setClipView({ mode: "clip", expanded: isQuick, item: snapshot() }) },
        { label: "Save as named snippet · Ctrl Shift S", run: snippetFromSelection },
        { label: "Edit selected text or template · Ctrl Shift E", run: () => setTemplateDialog(true) }
      ] : [])
    ]} />}
      {toolDialog && (
        <ToolDialog
          title={
            toolDialog === "filters"
              ? "Filters & saved searches"
              : "Combine clips & paste queue"
          }
          onClose={() => setToolDialog(undefined)}
        >
          {toolDialog === "filters" ? (
            <SearchTools
              query={query}
              filter={filter}
              options={searchOptions}
              onChange={(query, filter, options) => {
                setQuery(query);
                setFilter(filter);
                setSearchOptions(options);
              }}
            />
          ) : (
            <SelectionTools
              basket={basket}
              setBasket={setBasket}
              active={active}
            />
          )}
        </ToolDialog>
      )}
      {transformOpen && active && (
        <TransformPicker
          text={prepared ?? active.text}
          onHighlight={() => {
            setTransformOpen(false);
            setClipView({ mode: "clip", expanded: false, highlight: true, item: snapshot() });
          }}
          onClose={() => setTransformOpen(false)}
          onCopy={async (text) => {
            await api.copy(active, true, text);
            setToast("Transformed text copied");
            if (isQuick && api.native) await getCurrentWindow().hide();
          }}
        />
      )}
      {clipView && !clipView.expanded && (clipView.mode === "playground" || clipView.item) && (
        <ToolDialog
          tall
          title={clipView.mode === "playground" ? "Paste Playground" : "Full clip"}
          onClose={() => setClipView(null)}
        >
          {workbench(false)}
        </ToolDialog>
      )}
      {snippetDraft && (
        <SnippetEditor
          draft={snippetDraft}
          keyboardOnly={isQuick}
          collection={searchOptions.collection}
          onClose={() => { setSnippetDraft(undefined); requestAnimationFrame(() => resultButton(selected)?.focus()); }}
          onSaved={(_id, collection) => {
            setSnippetDraft(undefined);
            setQuery("");
            setSearchOptions(collection ? { collection } : {});
            setCollapsedSnippets([]);
            resetOnRefresh.current = true;
            requestAnimationFrame(() => listRef.current?.focus());
            setFilter("snippets");
            setToast("Snippet saved");
          }}
        />
      )}
      {templateDialog && active && (
        <TemplateDialog
          key={active.id}
          item={active}
          prepared={prepared}
          onPrepared={setPrepared}
          onClose={() => setTemplateDialog(false)}
        />
      )}
    </>
  );
  if (expandedView && clipView)
    return (
      <div className="quick-shell expanded-shell">
        <header>
          <span className="brand">
            <ArchiverMark size={24} />
            {clipView.mode === "playground" ? "Paste Playground" : "Full clip"}
          </span>
          <span className="esc-hint">
            <kbd>Esc</kbd> back to Librarian
          </span>
        </header>
        {workbench(true)}
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </div>
    );
  if (isQuick)
    return (
      <div className="quick-shell">
        {dialogs}
        <header>
          <span className="brand" role="img" aria-label="Archiver · Librarian">
            <ArchiverMark size={24} />
            Librarian
          </span>
          <button
            aria-label="Close quick access"
            onClick={() =>
              api.native ? void getCurrentWindow().hide() : history.back()
            }
          >
            <X size={17} />
          </button>
        </header>
        {!api.native && (
          <div className="preview-banner">
            Interactive preview · sample history
          </div>
        )}
        <div className="quick-destination">
          <span title={destination}>To: {destination || "Previous app"}</span>
          <button
            onClick={() => void api.archive()}
            title="Open Archivist · Ctrl+Alt+O"
          >
            Archivist <kbd>Ctrl Alt O</kbd>
          </button>
        </div>
        {panel}
        <footer>
          <span>
            <kbd>↑ ↓</kbd> select
          </span>
          <span>
            <kbd>↵</kbd> copy
          </span>
          <span>
            <kbd>Ctrl ↵</kbd> paste
          </span>
          <span>
            <kbd>Ctrl T</kbd> transform
          </span>
          <button
            className="shortcut-help"
            onClick={() => setShortcutsOpen(true)}
            aria-label="All keyboard shortcuts · F1"
          >
            <kbd>F1</kbd> all keys
          </button>
        </footer>
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </div>
    );
  return (
    <div className="shell">
      {dialogs}
      <aside className="sidebar">
        <div className="brand" role="img" aria-label="Archiver · Archivist">
          <ArchiverMark size={32} />
          <span>Archivist</span>
        </div>
        <div className="workspace">
          <span className="workspace-symbol">a</span>
          <div>
            Personal archive<small>STORED ON THIS DEVICE</small>
          </div>
        </div>
        <div className="nav-label">THE ARCHIVE</div>
        <nav>
          {filters.map((f) => (
            <button
              key={f.id}
              className={
                !settings && !statisticsOpen && filter === f.id ? "nav-item active" : "nav-item"
              }
              onClick={() => {
                setSettings(false); setStatisticsOpen(false); setGroupAction(undefined); setSearchOptions({}); setQuery(""); resetOnRefresh.current = true;
                if (f.id === "snippets") setCollapsedSnippets(null);
                setFilter(f.id);
              }}
            >
              <f.icon size={17} />
              {f.label}
              {f.id === "all" && (
                <span className="nav-count">{stats.items}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={statisticsOpen ? "nav-item active" : "nav-item"} onClick={() => { setSettings(false); setStatisticsOpen(true); }}><BarChart3 size={17} /> Statistics</button>
          <button
            className={settings ? "nav-item active" : "nav-item"}
            onClick={() => { setStatisticsOpen(false); setSettings(!settings); }}
          >
            <Settings size={17} />
            Settings
          </button>
          <div className="storage-note">
            <Database size={15} />
            <div>
              Stored on this device
              <small>{formatBytes(stats.bytes)} of captured content</small>
            </div>
          </div>
          <span className="version">ARCHIVER / 0.1.0 · FOUNDATION</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Personal archive <ChevronRight size={12} />{" "}
            <span>
              {settings
                ? "Settings"
                : statisticsOpen ? "Statistics" : filters.find((f) => f.id === filter)?.label || "History"}
            </span>
          </div>
          <div className="header-actions">
            <span className="capture-pill">
              <span
                className={`status-dot ${status?.paused ? "paused" : api.native && status?.clipboard !== "Listening" ? "unknown" : ""}`}
              />
              {api.native
                ? status?.paused
                  ? "Capture paused"
                  : status?.clipboard === "Listening"
                    ? "Capture active"
                    : "Capture status"
                : "Preview mode"}
            </span>
            <button
              className="icon-button"
              aria-label={status?.paused ? "Resume capture" : "Pause capture"}
              onClick={() => void action(() => api.pause(!status?.paused))}
            >
              {status?.paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          </div>
        </header>
        {!api.native && (
          <div className="preview-banner">
            <Archive size={14} /> Interactive browser preview · sample history ·
            launch the desktop app for capture
          </div>
        )}
        {statisticsOpen ? <Statistics stats={stats} /> : settings ? (
          <section className="settings-page">
            <span className="eyebrow">MAKE IT YOURS</span>
            <h1>Archive settings</h1>
            <p className="subtitle">A quiet archive, on your terms.</p>
            <div className="setting-card">
              <h3>Appearance</h3>
              <p>Choose a surface for your archive.</p>
              <div className="theme-picker">
                <button className={theme === "system" ? "theme-choice chosen" : "theme-choice"} onClick={() => setTheme("system")}>Follow system</button>
                <button
                  className={
                    theme === "dark" ? "theme-choice chosen" : "theme-choice"
                  }
                  onClick={() => setTheme("dark")}
                >
                  <span className="theme-swatch dark" />
                  Deep spruce
                </button>
                <button
                  className={
                    theme === "light" ? "theme-choice chosen" : "theme-choice"
                  }
                  onClick={() => setTheme("light")}
                >
                  <span className="theme-swatch light" />
                  Warm paper
                </button>
              </div>
            </div>
            <div className="setting-card">
              <h3>Capture & retention</h3>
              <p>
                All accessible content is captured unless you exclude its
                source. History never expires automatically.
              </p>
              <button
                className="secondary"
                onClick={() => void action(() => api.pause(!status?.paused))}
              >
                {status?.paused ? "Resume capture" : "Pause capture"}
              </button>
              <dl>
                <dt>Clipboard</dt>
                <dd>{status?.clipboard}</dd>
                <dt>Connected shells seen this run</dt>
                <dd>{status?.shells.join(", ") || "None yet"}</dd>
                <dt>Quick access</dt>
                <dd>{shortcutLabel(preferences.shortcut)}</dd>
                <dt>Local data</dt>
                <dd className="mono">{status?.dataPath}</dd>
              </dl>
              {status?.error && <p className="error">{status.error}</p>}
            </div>
            <div className="setting-card">
              <h3>Librarian state memory</h3>
              <p>Off opens All with the latest clip at the top. On restores your tab, search, filters, groups, selection and scroll position when you reopen Librarian.</p>
              <label className="memory-setting"><input type="checkbox" checked={!!preferences.librarianStateMemory} onChange={event => void action(() => api.savePreferences({ ...preferences, librarianStateMemory: event.target.checked }), "Librarian state memory updated")} /> Remember the last browsing state</label>
            </div>
            <div className="setting-card">
              <h3>Quick access shortcut</h3>
              <p>
                Focus the field and press your preferred combination. Conflicts
                leave the current shortcut active.
              </p>
              <label htmlFor="shortcut">Global shortcut</label>
              <input
                id="shortcut"
                className="setting-input"
                value={shortcutLabel(shortcutDraft)}
                readOnly
                onKeyDown={(event) => {
                  if (["Tab", "Escape"].includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const shortcut = shortcutFromKey(event);
                  if (shortcut) setShortcutDraft(shortcut);
                }}
              />
              <button
                className="secondary"
                onClick={() => setShortcutDraft("Ctrl+Super+Period")}
              >
                Reset to Ctrl + Win + .
              </button>
              <button
                className="primary"
                onClick={() =>
                  void action(
                    () =>
                      api.savePreferences({
                        ...preferences,
                        shortcut: shortcutDraft,
                        excludedApps: preferences.excludedApps,
                      }), "Shortcut updated",
                  )
                }
              >Save shortcut</button>
            </div>
            <div className="setting-card"><h3>Capture exclusions</h3><p>Exact executable names, one per line. Existing history stays preserved.</p><label htmlFor="excluded-apps">Excluded applications</label><textarea id="excluded-apps" className="setting-input" value={exclusionsDraft} onChange={event => setExclusionsDraft(event.target.value)} /><button className="primary" onClick={() => void action(() => api.savePreferences({ ...preferences, excludedApps: exclusionsDraft.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }), "Exclusions updated")}>Save exclusions</button></div>
            <HistoryImport /><IntegrationHealth /><RecoveryAndBackup /><Lifecycle /><OcrSettings /><ShortcutReference /><FeatureCatalog />
            <div className="setting-card"><h3>Shell integrations</h3><p>

                Run integrations/install.ps1 once. It sets up PowerShell 5.1 and
                7 profiles, installs Clink when needed, and connects CMD
                automatically. Restart your shells after setup.
              </p>
              <small>
                Re-run setup after adapter updates and restart your shells.
                Select the matching session to insert without running commands.
              </small>
            </div>
          </section>
        ) : (
          <>
            <section className="heading">
              <div>
                <h1>Your archive</h1>
                <p className="subtitle">
                  Your clips and commands. Right where you left them.
                </p>
              </div>
              <button
                className="secondary quick-trigger"
                onClick={() =>
                  api.native
                    ? void action(api.quick)
                    : window.open(
                        "/?quick=1",
                        "archiver-quick",
                        "width=480,height=720",
                      )
                }
              >
                <ArchiverMark size={20} />
                Librarian<kbd>{shortcutLabel(preferences.shortcut)}</kbd>
                <ArrowUpRight size={14} />
              </button>
            </section>
            <div className="archive-grid">
              <section className="feed">
                <div className="section-heading">
                  <h2>
                    {filter === "pinned"
                      ? "Pinned for later"
                      : filter === "snippets" ? "Snippet vault" : "Recent records"}
                  </h2>
                  <span>{filter === "snippets" ? "BY GROUP · A–Z" : "NEWEST FIRST"}</span>
                  <button className="secondary" onClick={() => setSnippetDraft({ name: "", kind: "text", text: "" })}>New snippet</button>
                </div>
                {filter === "snippets" && <p className="vault-intro">Your reusable text and commands, named and kept together.</p>}
                {panel}
              </section>
              <aside className="details" ref={detailRef} aria-label="Selected item details">
                {active ? (
                  <React.Fragment key={active.id}>
                    <div className="detail-label">
                      ITEM DETAILS
                      <ItemActions key={active.id} actions={[
                        ...(active.name ? [{ label: "Edit snippet", run: snippetFromSelection }] : active.pinned ? [{ label: "Rename pin", run: () => setRenamePin(active) }] : []),
                        { label: active.pinned ? "Unpin" : "Pin for later", run: () => void action(() => api.pin(active.id, !active.pinned)) },
                        ...(filter === "snippets" && active.name ? [{ label: "Move to group…", disabled: !api.native, run: () => setGroupAction("move") }] : []),
                        { label: "Tags & collections…", disabled: !api.native, run: () => setOrganizationOpen(true) },
                        ...(!active.name && active.text && !["image", "files"].includes(active.kind) ? [{ label: "Save as snippet…", run: snippetFromSelection }] : []),
                        ...(active.text && !["image", "files"].includes(active.kind) ? [{ label: "Open full clip…", run: () => setClipView({ mode: "clip", item: active, expanded: false }) }] : []),
                        { label: "Copy", run: () => void copy(active) },
                      ]} />
                    </div>
                    <div className={`detail-icon ${active.kind}`}>
                      {React.createElement(itemIcon(active), { size: 23 })}
                    </div>
                    <h2>
                      {active.name || active.title ||
                        (active.kind === "command"
                          ? "A command worth keeping."
                          : active.kind === "image"
                            ? "A captured image."
                            : "A moment, preserved.")}
                    </h2>
                    {active.kind === "image" ? (
                      <ImageDetail key={`image-${active.id}`} id={active.id} match={active.ocrMatch} />
                    ) : (
                      <Suspense
                        fallback={
                          <pre className="content-preview">{active.text}</pre>
                        }
                      >
                        <Highlight
                          key={`highlight-${active.id}`}
                          text={
                            active.text || `Captured ${active.kind} payload`
                          }
                          kind={active.kind}
                          source={active.source}
                        />
                      </Suspense>
                    )}
                    {active.text &&
                      active.kind !== "files" &&
                      active.kind !== "image" && !active.name && (
                        <TextWorkbench
                          key={`transform-${active.id}`}
                          item={active}
                          prepared={prepared}
                          onPrepared={setPrepared}
                        />
                      )}
                    {!active.name && active.note && <section className="snippet-note"><h3>Clip note</h3><p>{active.note}</p></section>}
                    {active.name && active.note && <section className="snippet-note"><h3>Note</h3><p>{active.note}</p></section>}
                    <div className="detail-actions">
                      {!active.name && <button className="secondary" onClick={() => setNoteId(active.id)}>Edit clip notes</button>}
                      {active.kind === "image" && <button className="secondary" onClick={() => setRegionId(active.id)}>Region OCR</button>}
                      {!["image", "files"].includes(active.kind) && <button className="secondary" onClick={() => setJsonText(prepared ?? active.text)}>JSON explorer</button>}
                      {!["image", "files"].includes(active.kind) && <><button className="secondary" onClick={() => setTextUtility({ kind: "diff", text: prepared ?? active.text })}>Text diff</button><button className="secondary" onClick={() => setTextUtility({ kind: "extract", text: prepared ?? active.text })}>Text extractors</button></>}
                      {!active.name && (
                        <button
                          className="secondary"
                          onClick={() =>
                            void action(
                              () => api.restoreLibrary(active.id),
                              "Added to the Librarian’s library",
                            )
                          }
                        >
                          Add to library
                        </button>
                      )}
                      {active.text && !["image", "files"].includes(active.kind) && <button className="secondary" onClick={snippetFromSelection}>{active.name ? "Edit snippet" : "Save as snippet"}</button>}{active.pinned && !active.name && <button className="secondary" onClick={() => setRenamePin(active)}>Rename pin</button>}{active.name && <button className="secondary" onClick={() => setGroupAction("move")}>Move to group</button>}
                      {active.kind === "command" && (
                        <>
                          <div className="shell-picker">{sessionPicker}</div>
                          <button
                            className="primary"
                            disabled={!shellSession}
                            onClick={() => void paste(active)}
                          >
                            Insert without running
                          </button>
                        </>
                      )}
                      {active.kind !== "command" && (
                        <button
                          className="primary"
                          onClick={() => void paste(active)}
                        >
                          Paste
                        </button>
                      )}
                      <button
                        className="primary"
                        onClick={() => void copy(active)}
                      >
                        <Copy size={14} />
                        Copy
                      </button>
                      <button
                        className={
                          active.pinned ? "secondary pinned" : "secondary"
                        }
                        onClick={() =>
                          void action(() => api.pin(active.id, !active.pinned))
                        }
                      >
                        <Pin size={14} />
                        {active.pinned ? "Pinned" : "Pin"}
                      </button>
                    </div>
                    <dl>
                      <dt>Source</dt>
                      <dd>{active.source || "Unknown"}</dd>
                      <dt>{active.name ? "Last edited" : "Last captured"}</dt>
                      <dd>{new Date(active.timestamp).toLocaleString()}</dd>
                      <dt>{active.name ? "Created" : "First captured"}</dt>
                      <dd>{new Date(active.firstSeen).toLocaleString()}</dd>
                      {active.kind === "command" && !active.name && (
                        <>
                          <dt>Last result</dt>
                          <dd>
                            {active.successful == null
                              ? "Completion unavailable"
                              : active.successful
                                ? "Succeeded"
                                : "Failed"}
                            {active.exitCode != null
                              ? ` · exit ${active.exitCode}`
                              : ""}
                          </dd>
                          <dt>Duration</dt>
                          <dd>
                            {active.durationMs == null
                              ? "Unavailable"
                              : `${(active.durationMs / 1000).toFixed(3)} s`}
                          </dd>
                          <dt>Failures recorded</dt>
                          <dd>{active.failures ?? 0}</dd>
                        </>
                      )}
                      {active.directory && (
                        <>
                          <dt>Directory</dt>
                          <dd className="mono">{active.directory}</dd>
                        </>
                      )}
                      {!active.name && <><dt>Occurrences</dt>
                      <dd>
                        {active.occurrences} meaningful{" "}
                        {active.occurrences === 1 ? "capture" : "captures"}
                      </dd>
                      </>}{active.formats.length > 0 && (
                        <>
                          <dt>Formats</dt>
                          <dd>{active.formats.join(" · ")}</dd>
                        </>
                      )}
                      <dt>Payload size</dt>
                      <dd>{formatBytes(active.bytes)}</dd>
                    </dl>
                    {!active.name && <Timeline key={`timeline-${active.id}`} id={active.id} />}
                    <ItemLabels key={`labels-${active.id}`} item={active} />
                    <ResourcePreview
                      key={`resource-${active.id}`}
                      item={active}
                    />
                    <div className="detail-footer">
                      {!active.name && active.kind !== "command" && active.source !== "Unknown source" && <button className="text-action" disabled={preferences.excludedApps.some(source => source.toLowerCase() === active.source.toLowerCase())} onClick={() => void action(() => api.savePreferences({ ...preferences, excludedApps: [...preferences.excludedApps, active.source] }), `Future copies from ${active.source} excluded`)}>Exclude future copies from this app</button>}
                      <button className="text-action" onClick={() => void copy(active, true)}>Copy as plain text <ArrowUpRight size={12} /></button>
                      {confirmDelete ? <div className="delete-confirm"><span>Delete this item and all occurrences?</span><button onClick={() => void action(async () => { await api.remove(active.id); removeQueuedItem(active.id); setBasket(items => items.filter(item => item.id !== active.id)); setConfirmDelete(false); }, "Deleted from archive")}>Delete permanently</button><button onClick={() => setConfirmDelete(false)}>Cancel</button></div> : <button className="text-action danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete item</button>}
                    </div>
                  </React.Fragment>
                ) : <div className="detail-empty"><FileText size={30} /><h2>A moment, preserved.</h2><p>Select a record to see its details.</p></div>}
              </aside>
            </div>
            <footer className="app-footer"><span>Stored on this device. Your history stays yours.</span><button className="text-action" onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts <kbd>F1</kbd></button></footer>
          </>
        )}
      </main>
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
