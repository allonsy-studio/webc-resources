# webc-resources: agent instructions

Studio-wide voice, style, licensing, and attribution rules live in the org
[`AGENTS.md`](https://github.com/allonsy-studio/.github/blob/main/AGENTS.md). This file
covers only this repo.

## What this repo is

A Yarn workspaces monorepo that publishes three npm packages of WebC components for
Eleventy sites. Each component carries its own CSS and JS in-file. The packages ship files,
not behavior: none registers `@11ty/eleventy-plugin-webc` or acts as an Eleventy plugin. The
consuming project owns the single WebC registration and points it at the installed folders.

| Package | Holds | Runtime dependencies |
| --- | --- | --- |
| `@allons-y/webc-patterns` | Generic page and docs patterns, the `adjacent` helper | None |
| `@allons-y/webc-code-sample` | `code-sample`, `tokenRanges`, `highlightFences` | `prismjs` |
| `@allons-y/webc-oss-site` | Locked studio layer, data wiring, page bodies, site data builders | `hosted-git-info`, `semver`, `markdown-it`; the other two as peers |

Dependencies point one way: `webc-oss-site` peers on the other two, and neither of them knows
the studio exists.

## Layout

```text
packages/<name>/   components/*.webc, index.js, README.md
fixtures/<name>/   one Eleventy site per flavor (landing, docs, workspaces) plus neutral
```

## Commands

| Command | Does |
| --- | --- |
| `yarn lint` | Lint JS, JSON, and Markdown with opx, including the MPL-2.0 header rule |
| `yarn format` | Same, with fixes applied |
| `yarn test` | Unit tests with `node --test` |
| `yarn pack:check` | Dry-run pack of every publishable package |
| `yarn opx release add` | Record a changeset |

Node 24 or later. Commits run `opx lint` through the Husky `post-commit` hook.

## Component conventions

1. One `.webc` file owns its markup, styles, and behavior. No dependence on a class, a global
   stylesheet, or another file's selectors.
2. Selectors start at the component's custom tag. No classes, no `webc:scoped`, no selectors
   reaching outside the component. Set `display` on the tag.
3. Wrap styles in a cascade layer: `components` for generic components, `studio` for studio
   components. `page-styles` declares the order once: `reset, tokens, base, layout, components, studio, print`.
4. Tokens fall back three deep: `var(--component-token, var(--shared-token, <system value>))`.
5. Print rules live in the component's own `@media print` block.
6. Props use the `@` prefix at every call site (`@title="…"`, `:@title="expr"`).
7. No HTML comments in components: they ship to every page. Document props and custom
   properties in JSDoc inside `<script webc:setup>`, which WebC removes. That block can't
   import npm modules.
8. Scripts are progressive enhancement, query their own tag, and run once per page.
9. Generic components take props and slots only, never `$data`. `$data.page` is allowed.
10. Nothing inside `<head>` may keep its custom tag: the parser moves everything after it
    into `<body>`. Use `webc:nokeep` or carry no `<style>` or `<script>`.
11. WCAG 2.2 AA in light, dark, and forced colors. Colors use `light-dark()`.
12. Spec links point to the section anchor, never a spec's home page.
13. Every `.js` file and every `webc:setup` block starts with the MPL-2.0 SPDX block comment
    (see `eslint.config.js`).

## Public contract

Changing any of these is a major version on the package that owns it: component tag names,
props and slot names, custom properties and their fallbacks, cascade layer names and order,
helper names components call (`tokenRanges`, `adjacent`), the `data-tokens` format, exported
functions and their options, the data shape the studio components read, and the `oss-docs`
and `project.json` schemas.

## Releases

Each package versions independently with changesets through `@allons-y/opx-release`,
starting at `0.1.0-beta.0`. Add a changeset for anything that changes a consumer's output.

## Commits and pull requests

Follow the org rules: pronoun-free, short, no em dashes, no AI attribution of any kind in
commits, PR bodies, changesets, changelogs, release notes, or code comments. Commits are
authored as Cassondra Roberts `<castastrophe@users.noreply.github.com>`.

## Licensing

MPL-2.0 for all three packages.
