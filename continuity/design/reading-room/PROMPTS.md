# Creative asset provenance

> Relocated 2026-10-13 from the former root `design-study/` folder during the full Continuity migration. The folder is otherwise byte-identical (offline study `index.html`, PDF, handoff ZIP, tokens, assets, QA). References in this document to the old root files were rewritten to their Continuity homes: STATUS.md -> `../../status.md` (current) and `../../developer/implemented-features.md`, ROADMAP.md/HANDOFF.md -> `../../planning/roadmap.md`, DESIGN.md -> `../../history/product-design-draft-0.2.md`. Wording otherwise reflects the date of the original (2026-10-12). Generated artifacts (`index.html`, PDF, ZIP) were not edited and may still name the old files.

The brand concept plate was made with the built-in image generation tool on October 12 2026 and saved as assets/brand-concept.png. It is a creative reference, not an app screenshot or production logo export. The SVG marks were authored separately as a deterministic, editable interpretation of the catalog-card idea. Physical texture, the wooden tray, and other props are confined to the concept plate.

## Exact generation prompt

```text
Use case: logo-brand
Asset type: art direction study for Archiver, a local desktop app with two windows called Librarian (quick retrieval) and Archivist (permanent history).
Primary request: Create a beautifully art-directed brand concept plate for a contemporary archive and reading-room identity. A minimal geometric mark made from three upright catalog cards with a stepped tab, subtly forming the capital letter A through negative space. Pair a large single-color spruce-green mark with the exact word "Archiver" set in elegant restrained editorial serif typography. Show one large mark, a tiny app icon interpretation, and tactile paper catalog cards with small index tabs, softly lit against warm ivory paper. Deep spruce #214E44, paper #F5F1E8, ink #252B28, muted brass #A5824F. Museum-quality editorial composition with generous whitespace, crisp flat vector-like mark, no space or physics motifs, no orbital rings, no rockets, no vintage ornamental library furniture, no ornate wax seals, no gradients in the logo. Landscape plate. Only text is "Archiver" and tiny role labels "Librarian" and "Archivist". This is a creative direction image, not an interface screenshot.
```

## Vector provenance

The primary mark contains three solid tabbed-card paths. The front card's negative-space notch hints at an A. The micro variant reduces the collection to two cards for small use. The app icon adds a solid spruce rounded-square container. The inverse mark changes the fill to the dark-theme accent. The wordmark reference uses live Instrument Serif text and must be converted to outlines with the bundled font before shipping as standalone artwork. The app's text wordmark should remain live text.

The study fonts are copied from the existing @fontsource packages with their licenses. No new paid fonts or runtime image services are needed by the proposed app theme.

