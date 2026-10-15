# Archiver maintenance instructions

- After every implementation turn, keep `src/feature-catalog.tsx`, `continuity/status.md` (with `continuity/developer/implemented-features.md`), and `continuity/planning/roadmap.md` aligned with the implemented behavior and remaining work, and record the turn in `continuity/implementation-log.md`. The feature catalog is visible in Archivist Settings; include capabilities without shortcuts and clearly label experimental/platform-limited work.
- Build Windows installers only for major releases or an explicit user request. Routine work uses frontend builds, Rust checks/tests, and optionally a no-bundle executable build. Do not replace installer artifacts for routine UI changes.
- Preserve permanent archive history. Clearing the library only changes visibility. Capture everything unless the user explicitly configures exclusions or deletion.
- Keep Ctrl+R shell search deferred until explicitly requested again.
- `continuity/planning/roadmap.md` (Q1-Q7 queue, formerly HANDOFF.md) defines the next implementation queue. Do not confuse its planned tasks with completed features.
- Routine implementation turns end by telling the user to run `npm run launch` (kills a running `archiver.exe`, builds with `tauri build --no-bundle`, starts `target/release/archiver.exe` detached) to see the change. It is not an installer build.

## Continuity

Before project work, read the project-root `continuity/agent/instructions.md`, `continuity/status.md`, and complete `continuity/agent/map.md`; reuse unchanged loaded context and follow relevant routes into source. Before ending every user-facing turn, update the implementation log and capture changed planning intent; follow the contract's UI design reading rules. Before every otherwise-authorized commit and every handoff, review changes, update affected Continuity documentation alongside implementation, and review status and changed links. Unaffected documents need no ceremonial edit. Follow all applicable repository instructions, including the rules above (feature catalog, `continuity/status.md` and `continuity/planning/roadmap.md` upkeep stays required).
