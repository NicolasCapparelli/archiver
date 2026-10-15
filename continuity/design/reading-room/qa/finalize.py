from pathlib import Path
root = Path(__file__).resolve().parents[1]
changes = [
('study.js', 'Archivist ${icon(\'chevron\')}</button>', 'Archivist <kbd>Ctrl Shift O</kbd></button>'),
('README.md', 'The maintenance instruction references `HANDOFF.md`, but that file was absent when this study was prepared. The implementation agent must inspect it if it becomes available before deciding where migration belongs in the queue.', '`HANDOFF.md` retains the feature queue: undo library clearing and OCR match previews first, then five extensions. This study does not reorder it or mark planned work complete.'),
('IMPLEMENTATION.md', 'Maintenance instructions reference HANDOFF.md as the implementation queue, but it was absent during preparation. Inspect it if available when work begins. Reconcile placement without inventing a new queue or labeling planned work complete.', 'HANDOFF.md defines the feature queue: undo library clearing and OCR match previews first, followed by portable import/restore, scheduled backups, Librarian bulk organization, library-aware fuzzy tuning, and actionable integration diagnostics. These are planned tasks, not completed capabilities. This visual brief does not reorder that queue. Preserve any of those capabilities that land before theme migration.'),
('index.html', 'HANDOFF.md was absent during this study. Inspect it if available before choosing migration queue placement. This study does not mark queued work complete.', 'HANDOFF.md retains the feature queue: undo library clearing and OCR match previews first, then five extensions. This study does not reorder it or mark planned work complete.'),
('index.html', 'Controls above change sample mock states only.', 'Interactive HTML offers sample scope and state controls.'),
]
for name,old,new in changes:
    p=root/name
    value=p.read_text(encoding='utf-8')
    if old in value:
        p.write_text(value.replace(old,new),encoding='utf-8')
    elif new not in value:
        raise ValueError(name)
p=root.parent/'STATUS.md'
value=p.read_text(encoding='utf-8')
value=value.replace('HANDOFF.md was absent when the study was prepared; inspect it if available before choosing queue placement.', 'HANDOFF.md retains its planned feature queue; the study does not reorder it or mark those tasks complete.')
p.write_text(value,encoding='utf-8')
print('Study reconciled with the current HANDOFF queue.')
