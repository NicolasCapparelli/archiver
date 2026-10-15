import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native, type Item, type SearchOptions } from "./api";
import { SessionTranscript } from "./session-transcript";
type Saved = {
  name: string;
  query: string;
  filter: string;
  options: SearchOptions;
};
type Session = {
  session: string;
  source: string;
  firstSeen: number;
  lastSeen: number;
  commands: number;
  directories: number;
  failures: number;
};
function dateValue(time: number | null | undefined) {
  if (time == null) return "";
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateTime(value: string, next = false) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day + (next ? 1 : 0)).getTime();
}
export function SearchTools({
  query,
  filter,
  options,
  onChange,
}: {
  query: string;
  filter: string;
  options: SearchOptions;
  onChange: (query: string, filter: string, options: SearchOptions) => void;
}) {
  const [saved, setSaved] = useState<Saved[]>([]),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [busy, setBusy] = useState(false);
  const [timelineSession, setTimelineSession] = useState("");
  async function refresh() {
    if (native) {
      setSaved(await invoke("saved_searches"));
      setSessions(await invoke("command_sessions"));
    } else {
      try {
        setSaved(
          JSON.parse(localStorage.getItem("archiver-saved-preview") || "[]"),
        );
      } catch {
        setSaved([]);
      }
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  function update(patch: SearchOptions) {
    onChange(query, filter, { ...options, ...patch });
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const search = { name: name.trim(), query, filter, options };
      if (!search.name) throw Error("Give this search a name.");
      if (native) await invoke("save_search", { search });
      else
        localStorage.setItem(
          "archiver-saved-preview",
          JSON.stringify([
            ...saved.filter(
              (s) => s.name.toLowerCase() !== search.name.toLowerCase(),
            ),
            search,
          ]),
        );
      await refresh();
      setMessage("Search saved. Saving an existing name updates it.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(name: string) {
    try {
      if (native) await invoke("delete_search", { name });
      else
        localStorage.setItem(
          "archiver-saved-preview",
          JSON.stringify(saved.filter((s) => s.name !== name)),
        );
      await refresh();
    } catch (e) {
      setMessage(String(e));
    }
  }
  const count = Object.entries(options).filter(
    ([key, v]) =>
      v !== undefined &&
      v !== null &&
      v !== "" &&
      (v !== false || key === "pinned"),
  ).length;
  return (
    <div className="search-tools">
      <p>Filters & saved searches {count > 0 && `· ${count} active`}</p>
      <div className="search-fields">
        <label>
          Source contains
          <input
            className="setting-input"
            value={options.source || ""}
            onChange={(e) => update({ source: e.target.value })}
          />
        </label>
        <label>
          Directory contains
          <input
            className="setting-input"
            value={options.directory || ""}
            onChange={(e) => update({ directory: e.target.value })}
          />
        </label>
        <label>
          Content type
          <select
            className="setting-input"
            value={options.kind || ""}
            onChange={(e) => update({ kind: e.target.value })}
          >
            <option value="">Any type</option>
            {["text", "rich", "image", "files", "command"].map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Pins
          <select
            className="setting-input"
            value={options.pinned == null ? "any" : String(options.pinned)}
            onChange={(e) =>
              update({
                pinned:
                  e.target.value === "any" ? null : e.target.value === "true",
              })
            }
          >
            <option value="any">Any</option>
            <option value="true">Pinned</option>
            <option value="false">Unpinned</option>
          </select>
        </label>
        <label>
          From date
          <input
            type="date"
            className="setting-input"
            value={dateValue(options.from)}
            onChange={(e) => update({ from: dateTime(e.target.value) })}
          />
        </label>
        <label>
          Through date
          <input
            type="date"
            className="setting-input"
            value={
              options.until == null
                ? ""
                : dateValue(
                    new Date(options.until).setDate(
                      new Date(options.until).getDate() - 1,
                    ),
                  )
            }
            onChange={(e) => update({ until: dateTime(e.target.value, true) })}
          />
        </label>
        <label>
          Tag
          <input
            className="setting-input"
            value={options.tag || ""}
            disabled={!native}
            onChange={(e) => update({ tag: e.target.value })}
          />
        </label>
        <label>
          Collection
          <input
            className="setting-input"
            value={options.collection || ""}
            disabled={!native}
            onChange={(e) => update({ collection: e.target.value })}
          />
        </label>
      </div>
      <label className="fuzzy-toggle">
        <input
          type="checkbox"
          checked={!!options.fuzzy}
          disabled={!native}
          onChange={(e) => update({ fuzzy: e.target.checked })}
        />{" "}
        Fuzzy words: prefixes, one typo, or adjacent transposition
      </label>
      {options.fuzzy && (
        <p>
          Matches indexed words in the first 32,768 characters / 512 words. Up
          to eight query words; use literal search for punctuation or longer
          content. Candidate lookups are bounded.
        </p>
      )}
      {options.session && (
        <p>
          Session {options.session}{" "}
          <button
            className="text-action"
            onClick={() => update({ session: "" })}
          >
            Clear session
          </button>
        </p>
      )}
      <p>
        Source, directory, and dates match the same occurrence. Snippets use
        their latest edit date.
      </p>
      <button className="secondary" onClick={() => onChange(query, filter, {})}>
        Clear filters
      </button>
      <div className="saved-search-editor">
        <label>
          Search name
          <input
            className="setting-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          Save current search
        </button>
      </div>
      {saved.map((search) => (
        <div className="saved-search-row" key={search.name}>
          <button
            className="secondary"
            onClick={() => {
              onChange(search.query, search.filter, search.options);
              setName(search.name);
            }}
          >
            Load {search.name}
          </button>
          <button
            className="text-action"
            aria-label={`Delete saved search ${search.name}`}
            onClick={() => void remove(search.name)}
          >
            Delete
          </button>
        </div>
      ))}
      <details>
        <summary>Recorded terminal sessions · {sessions.length}</summary>
        <p>
          The 100 most recent sessions; imports have no original session
          identity.
        </p>
        {sessions.map((session) => (
          <div key={session.session}>
            <button
              className="session-card secondary"
              key={session.session}
              onClick={() =>
                onChange("", "command", { session: session.session })
              }
            >
              <strong>{session.source}</strong>
              <span>
                {new Date(session.firstSeen).toLocaleString()} –{" "}
                {new Date(session.lastSeen).toLocaleString()}
              </span>
              <small>
                {session.commands} submissions · {session.directories}{" "}
                directories · {session.failures} failures
              </small>
            </button>
            <button
              className="text-action"
              onClick={() => setTimelineSession(session.session)}
            >
              View execution timeline
            </button>
          </div>
        ))}
        {timelineSession && (
          <>
            <button
              className="text-action"
              onClick={() => setTimelineSession("")}
            >
              Close timeline
            </button>
            <SessionTranscript
              key={timelineSession}
              session={timelineSession}
            />
          </>
        )}
      </details>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function ItemLabels({ item }: { item: Item }) {
  const [tags, setTags] = useState(""),
    [collections, setCollections] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(native);
  useEffect(() => {
    if (native)
      void invoke<[string, string][]>("item_labels", { id: item.id })
        .then((labels) => {
          setTags(
            labels
              .filter(([kind]) => kind === "tag")
              .map(([, name]) => name)
              .join(", "),
          );
          setCollections(
            labels
              .filter(([kind]) => kind === "collection")
              .map(([, name]) => name)
              .join(", "),
          );
          setLoading(false);
        })
        .catch((e) => setMessage(String(e)));
  }, [item.id]);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      if (!native) throw Error("Labels require the desktop archive.");
      await invoke("set_item_organization", {
        id: item.id,
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        collections: collections
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setMessage(
        "Tags and collections saved. Use their names in search filters.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="item-labels">
      <summary>{item.name ? "Tags & groups" : "Tags"}</summary>
      <p>Comma-separated names; empty fields remove existing labels.</p>
      <label>
        Tags
        <input
          className="setting-input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      {item.name && <label>
        Groups
        <input
          className="setting-input"
          value={collections}
          onChange={(e) => setCollections(e.target.value)}
        />
      </label>}
      <button
        className="secondary"
        disabled={busy || loading || !native}
        onClick={() => void save()}
      >
        Save labels
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
