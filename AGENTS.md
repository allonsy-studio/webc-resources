# webc-resources: agent instructions

Studio-wide voice, style, licensing, and attribution rules live in the org
[`AGENTS.md`](https://github.com/allonsy-studio/.github/blob/main/AGENTS.md). This file
covers only this repo.

## What this repo is

A Yarn workspaces monorepo that publishes three npm packages of WebC components and layouts for
Eleventy sites. Each component carries its own CSS and JS in-file. The Norn plugin, in the patterns
package, owns the project's one `@11ty/eleventy-plugin-webc` registration and registers the components,
the layouts, the helpers, and the Markdown add-ons. A project adds it once, with a `props` mapping from
its page data to the layout props.

| Package | Holds | Runtime dependencies |
| --- | --- | --- |
| `@allons-y/webc-patterns` | Generic components, the six `norn-*` layouts, the base and print styles and the optional reset, the Norn plugin (`/plugin`), the helpers components call, the Markdown add-on (`/markdown`), and the optional project data builders (`/project`) | `hosted-git-info`, `semver`, `markdown-it` (for `/project`); `@allons-y/webc-code-sample` as an optional peer |
| `@allons-y/webc-code-sample` | `norn-code-block`, `tokenRanges`, and the Markdown add-on `highlightFences` (`/markdown`) | `prismjs` |
| `@allons-y/webc-oss-site` (planned rename: `@allons-y/webc-studio`) | The studio theme: brand tokens, fonts, the locked `studio-bar`, `studio-cta`, and `studio-credit`, `studio-head`, `studioProps`, and the studio plugin | None; the patterns package as a peer |

Dependencies point one way: the studio theme package peers on patterns, patterns optionally on the code sample, and
neither of them knows the studio exists.

## Layout

```text
packages/<name>/   index.js, README.md, LICENSE, package.json
```

Component sources live in `packages/*/src` (`src/*.webc`, `src/layouts/*.webc`, `src/css/*.css`) and compile to
`components/`, `layouts/`, and `css/`. Those are build output: shipped in the package, never committed.

## Commands

| Command | Does |
| --- | --- |
| `yarn lint` | Lint JS, JSON, and Markdown with opx, including the MPL-2.0 header rule |
| `yarn format` | Same, with fixes applied |
| `yarn test` | Unit tests with `node --test` |
| `yarn pack:check` | Dry-run pack of every publishable package |
| `yarn opx release add` | Record a changeset |

Node 22 or later. CI runs 22 and 24, and `.nvmrc` pins 24. Commits run `opx lint` through the Husky `post-commit` hook.

## Component conventions

1. One `.webc` file owns its markup, styles, and behavior. No dependence on a class, a global
   stylesheet, or another file's selectors. A markup change updates the selectors in the same file in the
   same change: a selector that stops matching fails silently, and no test catches it. Check the
   component's stories in the preview before committing.
2. Selectors start at the component's custom tag. No classes, no `webc:scoped`, no selectors
   reaching outside the component. Set `display` on the tag.
   In a layout, landmark, or container, a descendant selector also styles the components slotted inside it,
   and the bundle order picks the winner. Reach slotted content through a child path from the slot's position
   (`norn-footer footer > div:first-child > * > ul`). Where prose styles must reach a slot's markup, scope them with `@scope`
   and stop the scope at the components that style all their own markup (`norn-rich-text` uses
   `@scope (norn-rich-text) to (norn-code-block, norn-code-tabs, norn-tag-list)`), with a `:where()` copy in
   `@supports not at-rule(@scope)` for older browsers. `:where()` only yields to a property the slotted component sets, so it is
   the fallback, not the first choice. `components.test.js` must check it.
3. Wrap styles in a cascade layer inside `norn`: `norn.components` for generic components, `norn.layout` for the layouts,
   `norn.studio` for studio components and tokens. `norn-page-head` declares the order once, in an inline style ahead of the
   bundle links: `norn.reset, norn.base, norn.layout, norn.components, norn.studio, norn.print`. One outer layer lets a project
   order the whole package against its own layers or a framework's, and keeps common names such as `base` and `components`
   from merging with theirs. A page renders its content before its layout, so the bundle order can't carry the layer order.
   The base and print styles live in `css/base.css` and `css/print.css`, which the plugin embeds in `norn-base`.
4. A component token falls back to the shared one, and the shared one to its default:
   `var(--component-token, var(--norn-space-m, t('space.m')))`. Define the shared tokens in `tokens.json` at the root, in Style Dictionary 3 format.
   It is the source of truth. A token's custom property is `--norn-` plus its path joined with hyphens (`ui.border.color` is
   `--norn-ui-border-color`). Write the sources in `src/` with `t('<path>')` as the fallback of every shared token you read, and
   never a literal default. The build compiles `src/*.webc` into `components/`, filling each `t()` from `tokens.json` with
   `@csstools/postcss-design-tokens`, and fails on an unknown path. Nothing defines a shared token at runtime: the base styles set no custom property, and a component declares no
   `@property` for one. A project overrides a token with its own `tokens.css` (`:root { --norn-ui-accent: #1f6f8b; }`) and every
   component follows. Derived tokens (`text.accent`, `text.on-accent`, `font.heading`) write the token they derive from as
   `var(--norn-ui-accent, {ui.accent})`, so a project value still drives them. A value in `tokens.json` may use `{path}` to
   name another token's default. A component's own custom properties (`--norn-page-toc-link`) keep their names and may register
   with `@property`, typed as the component likes. `components.test.js` must check the paths, the names, and the compiled values.
5. Print rules live in the component's own `@media print` block.
   The reset is optional, and nothing in Norn relies on it: a component that sets a size with padding or a
   border also sets `box-sizing: border-box`, zeroes the margins and list styles of its own markup, and sizes its own media.
6. Props use the `@` prefix at every call site (`@title="…"`, `:@title="expr"`).
7. No HTML comments in components: they ship to every page. The one exception is the three-dash server-only
   comment, `<!--- … --->`, which WebC drops from the output. A file has exactly one. It sits at the top, after any front matter,
   and holds the license header (rule 13) and the JSDoc for the component's props, slots, custom properties, and category.
   `norn-base` holds it in `<head>`: a comment ahead of the doctype makes WebC render the page without its doctype and shell. Keep the `/** … */` and ` * ` line format: the preview
   and `components.test.js` must be able to read it. The comment ends at the first `-->` or `--!>`, so its text never contains either. Close it with `--->`. A `--`, a brace, a backtick, or a tag name such as `<slot>` is safe. A `<script webc:setup>` holds code,
   never only comments. It can't import npm modules, and in a layout or page it runs once per template: compute per-page values
   in the attribute expressions, not in the setup block.
   A component's `webc:setup` helpers and its own props are not visible in slot content passed to other components:
   write data expressions inline, and pass a prop-driven value as a prop (`norn-segmented-control`'s `options`). Forwarding a `<slot>` into another component's children makes
   WebC recurse until it runs out of memory: render `$data.content` instead.
   A slot takes one element: a second one with the same `slot` name replaces the first, so group
   several in `<template slot="name" webc:nokeep>`.
8. Behavior is a custom element registered under the component's own tag, guarded by `customElements.get`, so it
   also covers elements added or moved after load. The server-rendered markup is the whole component without the
   script. Setup is idempotent (`connectedCallback` runs again on a move), waits for `DOMContentLoaded` while the
   document is still parsing, and is undone in `disconnectedCallback`.
9. Generic components take props and slots only, never `$data`. `$data.page` is allowed. A layout reads its props as
   `$data.norn`, plus `$data.page` and `$data.content`, and never `$data.site` or `$data.project`. `norn-base` also reads `$data.layout`, the page's own layout, to tell a Markdown page on the frame from content that is already compiled.
   A dynamic `style` or `class` attribute must evaluate to a string, never `undefined`: WebC throws.
   Return `''` to omit it.
   A prop that isn't passed resolves to a same-named Eleventy helper or page data, not to
   `undefined`: `url` is the `url` filter. Guard with `typeof url === 'string'`.
   An object literal as a whole expression reads as a block: wrap it, `:@prev="({ url: '#a' })"`.
   A boolean prop is on for `true`, `''` (a bare `@x`), and `'true'`, and off otherwise:
   test `x === true || x === '' || x === 'true'`, so `@x="false"` stays off.
   A prop the output can't do without throws from a `webc:setup` function called in the markup, naming the
   component and the prop, as `norn-svg-icon` and `norn-segmented-control` do: WebC's own errors name neither.
10. Nothing inside `<head>` may keep its custom tag: the parser moves everything after it
    into `<body>`. Call a head component as `<meta webc:is="name" webc:nokeep />`: it has no
    children, so a head component has no slot. Bundle links need `webc:keep`, and `webc:if`
    can't guard them: the bundle URL resolves after render, so `dropEmptyBundleTags` removes
    the empty tags.
11. WCAG 2.2 AA in light, dark, and forced colors. Colors use `light-dark()`.
12. Spec links point to the section anchor, never a spec's home page.
13. Every `.js` file starts with the MPL-2.0 SPDX block comment (see `eslint.config.js`). Every `.webc` file carries the same
    block as the first lines of its `<!--- … --->` comment (rule 7), never in a `webc:setup` block. The lint rule covers `.js`; `components.test.js` must check the `.webc` files.
14. Every component names its category in its JSDoc with `@category`: `layout` (arranges other things: grids and
    page frames), `landmark` (renders a page region with a role and a name), `container` (a bounded surface that holds
    content), `component` (a self-contained element), `template` (an Eleventy layout: a whole page, filled from props;
    only the `norn-*` layouts), or `document` (head components).
    `components.test.js` must check it, and the preview groups its navigation by it.
15. Every component outside the document head, and every layout, has at least one story in
    `preview/content/stories/<package>/<name>/`. A story is a WebC page rendered in a frame, with its
    source shown on the component's page. A layout's story is a whole page on that layout (`layout: norn-landing.webc`). The page's props, slots, and custom properties are read from the
    component's JSDoc, in its `<!--- … --->` comment, so keep that accurate.
16. Content goes in slots, not attributes, wherever it can: always for layouts, landmarks, and containers.
    Headings, text, links, and lists are the caller's markup, so the caller picks heading levels and adds icons.
    A list component takes `<li>` children in its default slot. Props are for settings (`@variant`, `@href`),
    and for data a component must compute from, such as `norn-side-nav` marking the current page. Document an
    unnamed slot as `@slot - …`; WebC can't test a slot for content, so hide an empty wrapper with
    `:not(:has(*))` in CSS.
    Never put a fallback in a default slot: any child, a line break included, replaces it. A short label with a
    default is a named slot (`norn-skip-link`'s `label`), and a data-driven alternative to the slot uses `webc:if` with
    `<slot webc:else>` (`norn-segmented-control`'s `options`). Named slot fallbacks are safe.
17. Every string a visitor sees or hears is content in the page, through a named slot, never a prop: accessible
    names and script-shown text included. The slot's fallback looks the string up site-wide, then gives the English
    default: `<slot name="label"><span webc:nokeep @text="nornComponentStrings?.('norn-page-toc', 'label', $data.page) || 'On this page'"></span></slot>`.
    The key is the slot name; list it and its default in `defaultStrings` in the patterns package's `index.js` (`norn-call-out`'s
    `heading` and `norn-page-notice`'s `prefix` key by variant). A layout has no caller to fill a slot: it looks its texts up
    under its own name (`nornComponentStrings?.('norn-landing', 'license', $data.page) || 'License: {license}'`), and
    names a landmark with `aria-labelledby` pointing at a hidden span. An accessible name points `aria-labelledby` at the
    rendered text, with an id built from WebC's `uid` (`:id="'norn-page-toc-' + uid"`). WebC hands a component the
    uid of each component it meets, slotted ones included, so read `uid` only between the same two slots or component
    tags. A landmark without a visible title renders its name as visually hidden text, styled in the component. Text
    only a script shows sits in the page as hidden elements (`<span hidden><span data-string="copied">…</span></span>`)
    that the script reads with `textContent`, never in a `data-*` attribute. A slot can't be forwarded into a nested
    component: the outer component renders the texts and hands the inner one their holder's id (`norn-code-block`'s
    copy button). Never build a sentence by joining words around a value: take a template with a placeholder
    (`{count}`, `{name}`). Counts use `Intl.PluralRules` and `Intl.NumberFormat` for the nearest `lang`. The Markdown
    add-on (`@allons-y/webc-patterns/markdown`, `@allons-y/webc-code-sample/markdown`) writes no string and fills no slot: it writes the tag an author would write, and the registry supplies the texts.
    `components.test.js` must check that the registry, the slots, and the JSDoc agree.
18. Component CSS uses native nesting with an explicit `&`: the host tag appears once and the rest nests inside it (Baseline 2023: Chrome 120, Safari 17.2, Firefox 117). A nested selector keeps the specificity of the flat one, so `:where()` and `:is()` wrappers stay where they were.

## The plugin, the layouts, and themes

- **The plugin.** `config.addPlugin(norn, { props, layouts, components, exclude, strings, markdown, defaults, icons })`, from
  `@allons-y/webc-patterns/plugin`. It registers `@11ty/eleventy-plugin-webc` once (the patterns, the code sample when it is
  installed, then `components`), the six layouts through `addTemplate` under the project's layouts folder (or includes
  folder), the helpers, the Markdown add-ons through `amendLibrary`, `dropEmptyBundleTags`, and `eleventyComputed.norn`.
  It fails the build when the plugin or plugin-webc is registered twice, and when the project's includes or layouts folder
  holds a file named like a shipped layout. Eleventy lists a virtual layout outside the input folder as a page too; a
  preprocessor skips those paths.
- **Props.** `props` maps page data to the layout props; without it, the same-named page data. It also runs against
  Eleventy's placeholder data, so it never throws on missing data, and every list prop defaults to `[]`. `norn` is a reserved
  data key.
- **Layouts.** `norn-base` (the frame), `norn-docs`, `norn-docs-home`, `norn-landing`, `norn-workspaces`, `norn-workspace`,
  each extending `norn-base`. Sources live in `packages/webc-patterns/src/layouts/` and compile to `layouts/`, which ships. A layout's
  own CSS sits in `norn.layout` and starts at a `data-norn-*` attribute or a component tag of its own markup.
- **Hooks.** `norn-base` renders `head`, `banner`, `cta`, and `credit` with `<template webc:nokeep @html="nornHook('name')">`.
  `fillHooks(config, fills)` appends markup; an unknown name throws; page data can't change a hook.
- **Themes.** A theme is a CSS file of custom properties plus hook fills and components, added through the plugin's
  `components` option. The studio plugin adds the Norn plugin with its components, fills the hooks, embeds its `tokens.css`,
  sets `themeColor` and `locale` as `defaults`, and copies the fonts.
- **Icons.** The `icons` option takes a glob or list of globs of `.svg` files, or a record of names to a path or `{ src, mirror }`. The plugin reads them at build time and the `nornIcons` helper hands them to `norn-svg-icon`, which draws a project icon over a built-in of the same name, with the file's `viewBox` (else one from a numeric `width` and `height`, else `0 0 24 24`) and its own paint.
- **Code samples.** `@allons-y/webc-code-sample` is an optional peer of patterns. With it, layouts render `norn-code-block`;
  without it, `<pre><code>`. A layout tests `typeof nornTokenRanges === 'function'`.

## Decisions

1. Tag prefix: `norn-` on every patterns and code-sample component, no "site" in a name. Studio components use `studio-` and never `norn-`.
2. Strings: every visitor-facing string is content in the page, through a named slot, with the `componentStrings` registry as the fallback and the English default last. No string props.
3. Studio copy stays English.
4. One footer navigation, with grouped lists.
5. Page templates ship as Eleventy layouts named `norn-*.webc`, all extending `norn-base.webc`.
6. Markdown is an add-on that writes the same markup an author would. Components are designed for hand-written HTML.
7. The studio package holds only branding and marketing content. Everything generic lives in patterns.
8. Projects keep their data in any shape and map it to component and layout props. Nothing in Norn reads a fixed `site` or `project` object.
9. Shared design tokens are compiled `var()` fallbacks: `tokens.json` holds the defaults, the build writes them into each component, and a project overrides any token with its own `tokens.css`. No stylesheet has to define them.
10. The Norn plugin owns the one plugin-webc registration; a theme or project adds globs through its `components` option, and nothing touches plugin-webc's internals.
11. `norn-base` exposes four hooks (`head`, `banner`, `cta`, `credit`) through the `nornHook` helper. Fills append; an unknown name throws.
12. A theme is a CSS file of custom properties. There is no theme API for styling.
13. `@allons-y/webc-code-sample` is an optional peer of patterns: present, the plugin registers it and layouts use it; absent, layouts render `<pre><code>`.
14. The reset is optional: Norn looks the same without it.
15. Browser support is evergreen browsers from about 2024 (`@layer`, `light-dark()`, `:has()`, container queries). A feature newer than that (`@scope`, `::details-content`, `interpolate-size`, the CSS Custom Highlight API) degrades gracefully: the content stays readable and usable without it, with no polyfill. The root README and each package README say so in one line.

## Public contract

Changing any of these is a major version on the package that owns it: component tag names,
props and slot names, layout names and their props (the `norn` data key), hook names, the plugin's options,
custom properties and their fallbacks, cascade layer names and order,
helper names components and layouts call (`nornTokenRanges`, `nornAdjacent`, `nornHeadings`, `nornComponentStrings`, `nornHook`, `nornIcons`), the `norn` layer and `--norn-*` token names (and the paths in `tokens.json` that name them), the `data-tokens` format, exported
functions and their options, the string keys in `defaultStrings`, the `project.json` schema (patterns), and the `oss-docs`
schema (studio).

## Releases

Each package versions independently with changesets through `@allons-y/opx-release`,
starting at `0.1.0-beta.0`. Add a changeset for anything that changes a consumer's output.
Until `1.0.0`, the repo stays in changesets pre mode (`beta`), so releases version as `0.1.0-beta.N`.
Leave it with `yarn opx release pre exit` before `1.0.0`. Set `onlyUpdatePeerDependentsWhenOutOfRange`
so a peer bump does not force a major on dependents whose range still holds.

## Commits and pull requests

Follow the org rules: pronoun-free, short, no em dashes, no AI attribution of any kind in
commits, PR bodies, changesets, changelogs, release notes, or code comments. Commits are
authored as Cassondra Roberts `<castastrophe@users.noreply.github.com>`.

## Licensing

MPL-2.0 for all three packages.
