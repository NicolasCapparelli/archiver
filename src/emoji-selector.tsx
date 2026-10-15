import { useEffect, useRef, useState } from 'react';
import { emojiGroups, searchEmoji, emojiGridIndex, type Emoji } from './emoji-search';
import { navigationKey } from './navigation';
import { ToolDialog } from './tool-dialog';
import * as api from './api';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function EmojiSelector({ quick, onClose, onToast }: { quick: boolean; onClose: () => void; onToast: (text: string) => void }) {
  const [query, setQuery] = useState(''), [group, setGroup] = useState(''), [index, setIndex] = useState(0);
  const [limit, setLimit] = useState(80), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), delivering = useRef(false);
  const matches = searchEmoji(query, group), active = matches[index];
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  async function deliver(emoji: Emoji, paste: boolean) {
    if (delivering.current) return;
    delivering.current = true; setBusy(true); setError('');
    try {
      await api.deliverEmoji(emoji.text, paste);
      onToast(paste ? 'Paste sent to previous app' : 'Copied to clipboard');
      onClose();
      if (quick && api.native && !paste) await getCurrentWindow().hide();
    } catch (e) {
      setError(String(e));
      if (api.native && paste) { await getCurrentWindow().show(); await getCurrentWindow().setFocus(); search.current?.focus(); }
    } finally { delivering.current = false; setBusy(false); }
  }
  function reset() { setIndex(0); setLimit(80); list.current?.scrollTo({ top: 0 }); }
  return <ToolDialog title="Emoji catalog" onClose={onClose}>
    <section className="emoji-selector" aria-label="Emoji selector" onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      const target = event.target as HTMLElement;
      const inSearch = target === search.current, inResults = !!target.closest('.emoji-results');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); return; }
      if (!inSearch && !inResults) return;
      const key = navigationKey(event, quick, inSearch);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (inSearch && ['Home', 'End'].includes(key)) return;
        if (inSearch && ['ArrowLeft', 'ArrowRight'].includes(key)) return;
        event.preventDefault();
        const columns = Math.max(1, getComputedStyle(list.current!).gridTemplateColumns.split(' ').length);
        const next = emojiGridIndex(index, key, matches.length, columns);
        setIndex(next); setLimit(previous => Math.max(previous, next + 1));
        requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus());
      }
      if (event.key === 'Enter' && !event.altKey && active) { event.preventDefault(); void deliver(active, event.ctrlKey || event.metaKey); }
    }}>
      <p>Find an emoji by name, feeling, category or symbol.</p>
      <input ref={search} data-initial-focus aria-label="Search emojis" placeholder="Search emojis…" value={query} onChange={event => { setQuery(event.target.value); reset(); }} />
      <label>Category<select value={group} onChange={event => { setGroup(event.target.value); reset(); search.current?.focus(); }}><option value="">All categories</option>{emojiGroups.map(name => <option key={name}>{name}</option>)}</select></label>
      <span className="emoji-count" role="status">{matches.length.toLocaleString()} emoji{matches.length === 1 ? '' : 's'}</span>
      <div className="emoji-results" ref={list} role="group" aria-label="Emoji results" aria-busy={busy} onScroll={event => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) setLimit(previous => previous + 80); }}>
        {matches.slice(0, limit).map((emoji, i) => <button key={emoji.text} className={`entry emoji-entry ${i === index ? 'selected' : ''}`} data-index={i} aria-label={emoji.name} title={emoji.name} tabIndex={i === index ? 0 : -1} aria-pressed={i === index} disabled={busy} onFocus={() => setIndex(i)} onClick={() => setIndex(i)} onDoubleClick={() => void deliver(emoji, false)}>
          <span className="emoji-glyph" aria-hidden="true">{emoji.text}</span>
        </button>)}
        {!matches.length && <p className="empty">No matching emojis. Try another name or category.</p>}
      </div>
      <div className="emoji-caption" aria-live="polite">{active ? <><strong>{active.name}</strong><small>{active.group}</small></> : 'No emoji selected'}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions">{quick ? <span className="keyboard-hints"><kbd>↑ ↓</kbd> select · <kbd>Enter</kbd> copy · <kbd>Ctrl Enter</kbd> paste · <kbd>Ctrl K</kbd> search</span> : <><button disabled={busy || !active} onClick={() => active && void deliver(active, false)}>Copy</button><button disabled={busy || !active} onClick={() => active && void deliver(active, true)}>Paste</button></>}</div>
    </section>
  </ToolDialog>;
}
