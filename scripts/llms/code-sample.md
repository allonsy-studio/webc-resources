# @allons-y/webc-code-sample

> `norn-code-block`: a WebC code sample highlighted at build time. Shiki runs during the build. The browser gets token ranges for the CSS Custom Highlight API and a copy button, and no highlighter. The reference at the end is generated from the component source.

## What you are working with

- One component, `norn-code-block`, and one Markdown add-on, `highlightFences`.
- It is an optional peer of `@allons-y/webc-patterns`. Installed beside it, the Norn plugin registers the component, the `nornTokenRanges` helper, and the add-on, and the Norn layouts show their code with it. Without it, the plugin registers a plain `norn-code-block` that renders `<pre><code>`, so every call site works either way.
- It registers nothing itself. Do not add it to a project's WebC `components` list when the Norn plugin is in use.

## Use it

```html
<norn-code-block @language="js" @caption="example.js" @code="const answer = 42;"></norn-code-block>
```

- Props take the `@` prefix. `@code` is required and holds the code as a string. `@language`, `@caption`, and `@chrome` are optional. The component has no default slot for code.
- In Markdown, a fenced block becomes a `norn-code-block` with the fence's first word as `@language`. Write fences as normal.
- Every visitor-facing text is a named slot: `label` (names the code when there is no caption), `copy-label` (names the button; `{name}` stands for the code's name), `copy`, `copied`, `failed`. An empty slot falls back to the site's `componentStrings`, then English.

```html
<norn-code-block @language="sh" @code="npm install">
	<span slot="label">Commande d'installation</span>
	<span slot="copy">Copier</span>
</norn-code-block>
```

## Rules

- An unknown or empty language renders plain, readable text with no highlighting. Use `loadLanguages` from the package to register more Shiki languages at build time.
- Theme the colors with the shared tokens (`--norn-code-keyword`, `--norn-code-string`, `--norn-code-flag`, and the rest of the `code` group) in the project's own stylesheet. The component has no custom property of its own.
- `@chrome="terminal"` frames the code with a flat header bar for the caption. It is a prop, not a custom property.
- `data-tokens` is an implementation detail: a compact group table plus integer triples. Read it with `decodeRanges` if you must. Do not write it by hand.
- Highlighting needs the CSS Custom Highlight API. A browser without it shows the code as plain text.

## Where to look next

- README: install, usage without the Norn plugin, translating, layout requirements.
- Component preview: https://allonsy-studio.github.io/webc-resources/
