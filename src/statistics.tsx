import { useEffect, useState } from "react";
import * as api from "./api";

export function Statistics({ stats }: { stats: api.Stats }) {
  const [details, setDetails] = useState<api.ArchiveStatistics>();
  const [error, setError] = useState("");
  useEffect(() => { let live = true; void api.archiveStatistics().then(value => { if (live) { setDetails(value); setError(""); } }).catch(e => { if (live) setError(String(e)); }); return () => { live = false; }; }, [stats]);
  const date = (value: number | null) => value === null ? "No captures yet" : new Date(value).toLocaleString();
  return <section className="statistics-page">
    <span className="eyebrow">THE RECORD IN NUMBERS</span><h1>Archive statistics</h1>
    <p className="subtitle">Your permanent history and the things you’ve kept for later.</p>
    <div className="statistics-cards">{[
      ["Archived items", stats.items.toLocaleString(), "Distinct clips and commands"],
      ["Capture events", stats.occurrences.toLocaleString(), "Recorded occurrences"],
      ["Commands captured", stats.commands.toLocaleString(), "Command occurrences"],
      ["Captured content", (stats.bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " MB", "Stored clipboard representations"],
      ["Retention", "Forever", "History has no automatic expiry"],
      ...(details ? [["Saved snippets", details.counts.snippets.toLocaleString(), "Reusable items in your vault"], ["Groups", details.groups.toLocaleString(), "Including empty groups"], ["Pinned items", details.counts.pins.toLocaleString(), "Clips, commands and snippets"], ["Visible in library", details.counts.library.toLocaleString(), "Archive history stays preserved"], ["Capture sources", details.counts.sources.toLocaleString(), "Distinct recorded source names"], ["Total captures", details.counts.copies.toLocaleString(), "Includes repeated clipboard copies"]] : []),
    ].map(([label, value, caption]) => <article className="statistic-card" key={label}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {!details && !error && <p role="status">Loading archive details…</p>}
    {details && <><div className="statistics-breakdowns">{[["Items by type", details.kinds], ["Most active sources", details.sources]].map(([title, rows]) => <article className="setting-card" key={title as string}><h3>{title as string}</h3>{!(rows as api.StatisticCount[]).length ? <p>No captures yet.</p> : <dl>{(rows as api.StatisticCount[]).map(row => <div className="statistic-row" key={row.name}><dt>{row.name || "Unknown source"}</dt><dd>{row.count.toLocaleString()}</dd></div>)}</dl>}</article>)}</div><article className="setting-card"><h3>Archive timeline</h3><dl><dt>First capture</dt><dd>{date(details.counts.firstCapture)}</dd><dt>Latest capture</dt><dd>{date(details.counts.lastCapture)}</dd></dl></article></>}
  </section>;
}
