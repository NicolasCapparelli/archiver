# Aurora and TokenSeed integration

Aurora and TokenSeed are independently optional design tools; adopting either is a project choice. Neither is required to use Continuity.

## Project adoption

- **Aurora: unused.** No dependency in `package.json`.
- **TokenSeed: unused.** No TokenSeed seed or export exists in the repository.
- **Existing token system**: CSS custom properties in `src/style.css` (`:root` dark default, `:root[data-theme="light"]` overrides), documented in the [design language](system.md#tokens-and-appearances). [`reading-room/tokens.css`](reading-room/tokens.css) is the Reading Room study's token proposal, not runtime authority. Fonts come from the `@fontsource/dm-sans` and `@fontsource/instrument-serif` packages.
- No theming migration is proposed, and no tool was installed or inspected during initialization.
