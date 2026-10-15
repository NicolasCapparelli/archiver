# UI design home

Before UI work, read [the design language](system.md), [tool integration](integrations.md) where relevant, and only the relevant [board references](boards/README.md). Inspect the actual token source and reusable components before extending UI. Reuse unchanged context.

The design language records accepted visual intent. Runtime tokens and components own implemented values and behavior; locked requirements retain their authority. Boards demonstrate atmosphere and reusable patterns, with illustrative data; they do not specify exact screens or navigation. Record disagreements beside the affected rule and in status when blocking work. Do not silently redesign the product to match a mockup or turn a proposed study into an accepted rule.

## Archiver specifics

Archiver has a React UI in Tauri with an accepted Reading Room language: [design language](system.md). Runtime token and component source is `src/style.css` (tokens in `:root` and `:root[data-theme="light"]`) plus the React components named in the language page. Neither Aurora nor TokenSeed is used ([integrations](integrations.md)). No board exists; the Reading Room study in [reading-room/](reading-room/README.md) (relocated from the former root `design-study/`) is the visual reference ([boards](boards/README.md)). Visual checks use the built frontend or the desktop app in both themes.

## Optional board and tools

Board creation requires a specific user request plus a useful reference. General initialization records the existing language/references; an unfinished visual direction is a reason to defer generation. Run the retained [board initialization prompt](initialize-board.md) whenever ready. Aurora and TokenSeed are independently optional; use the project's existing styling system and read only integration details that apply.

## Extending the language

Find the nearest accepted pattern, reuse its semantic tokens and primitives, and cover the new pattern's relevant states. Extend the design language and an existing board only when introducing or changing a reusable rule; this does not require creating a new board. Keep proposed redesigns in [planning studies](../planning/README.md), with their acceptance state visible. Record intentional exceptions and why they are needed.

Before handoff, compare the affected UI to accepted references at relevant widths and appearances. Exercise keyboard/focus, long content, loading/empty/error/disabled states and reduced motion where affected. Record actual visual/interaction checks and untested cases in the [implementation log](../implementation-log.md); these instructions do not prove accessibility or visual consistency.
