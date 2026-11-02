# @allons-y/webc-patterns

> Norn: WebC components, Eleventy page layouts, and one Eleventy plugin for docs, landing, and workspace sites. Read this file before you write or change a site that uses it. The reference at the end is generated from the component sources, so every prop, slot, and token in it is real.

## What you are working with

- Every component is a custom tag (`<norn-card>`) that a `.webc` page or layout calls. The plugin registers all of them, so a page needs no import.
- Page templates are Eleventy layouts named `norn-*.webc`. A page picks one in its front matter: `layout: norn-docs.webc`.
- The Norn plugin owns the project's one `@11ty/eleventy-plugin-webc` registration. Do not add the WebC plugin as well.
- Each component carries its own CSS and JS, so a page ships only what it uses. There is no stylesheet to import.
- Do not copy component files into a project, edit `node_modules`, or write markup that imitates a component. Call the component. To change one, use a prop, a slot, a global token, or CSS against its tag (see Styling).

## Set it up

```js
import norn from "@allons-y/webc-patterns/plugin";

export default function (config) {
	config.addPlugin(norn, {
		props: (data) => ({ title: data.title, name: "My project", nav: [{ href: "/docs/", title: "Docs" }] }),
	});

	return { markdownTemplateEngine: false };
}
```

- `props` maps the project's own page data to the layout props. Without it, each layout prop is read from the same-named page data. It also runs against placeholder data, so it must not throw on missing data.
- Other options: `layouts`, `components`, `exclude`, `strings`, `markdown`, `defaults`, `icons`. The README lists what each does.
- The project is an ES module and needs Node 22 or later. `@11ty/eleventy` and `@11ty/eleventy-plugin-webc` are peer dependencies.
- For the Allons-y Studio brand, use `@allons-y/webc-oss-site` in place of this plugin. It adds this one.
- Fail-fast rules the plugin enforces: a second plugin registration, a project layout or include named like a shipped layout, and a page that sets the reserved `norn` front matter key all fail the build.

## Pick a layout

| Layout | Use it for |
| --- | --- |
| `norn-base.webc` | The frame the others extend: head, skip link, header, `main`, footer. Use it directly for a plain page |
| `norn-docs.webc` | A docs page: sidebar, search, contents, pager |
| `norn-docs-home.webc` | The docs landing page |
| `norn-landing.webc` | A project home page: hero, features, packages |
| `norn-workspaces-home.webc` | The index of a monorepo's packages |
| `norn-workspace.webc` | One package's page |

Every layout reads its props from the `norn` data (what `props` returns). Each layout's props are in the reference below. Props that are lists default to `[]`.

## One data shape for items

Every list item that links or describes something has the same keys: `href` (the address), `title` (the label), `description` (the short text), and `icon` where one is drawn. This holds for nav and footer links, docs pages, `prev` and `next`, breadcrumbs, side-nav items (and their `children`), workspaces, package cards, and feature cards. Map Eleventy pages with `href: page.url`. Props that are not items keep their names (`name`, `url`, `license`). There are no aliases for `url`, `name`, or `body`: an item written the old way renders without its link or label.

## Call a component

```html
<norn-card @accent="info" @title-face="mono">
	<h3><a href="/docs/start/">Get started</a></h3>
	<p>Install the plugin and pick a layout.</p>
</norn-card>
```

1. **Props** take the `@` prefix and are kebab-case in markup: `@title-face`. A computed value is `:@prop="expression"`. An object literal as the whole expression reads as a block, so wrap it: `:@prev="({ href: '/a/', title: 'A' })"`.
2. **Content goes in slots, not attributes.** The default slot takes the caller's own markup, so the caller picks heading levels, links, and icons. Name a slot with `slot="name"` on one element. A second element with the same slot name replaces the first, so group several in `<template slot="name" webc:nokeep>`.
3. **Every string a visitor sees or hears is a slot**, never a prop: labels, accessible names, button texts. An empty slot falls back to the site's `strings` option (`componentStrings`, by language), then to English. Translate by filling the slot or by setting `strings`.
4. **Booleans** are on for `@x` (bare), `@x="true"`, and `:@x="true"`, and off otherwise. `@x="false"` is off.
5. **Pick the heading level for the outline.** A card in a section under an `h2` takes an `h3`.
6. **Do not forward a `<slot>` into another component.** Render `$data.content` in a layout instead.
7. A component not in the reference does not exist. Do not guess tag names or props: an unknown prop is silently ignored.

## Markdown

With `markdown` on (the default) the plugin adds: component tags with `@` props that stay tags in Markdown, GitHub-style callouts (`> [!NOTE]`) as `norn-callout`, scrolling tables, anchored headings, one title per docs page, and fenced code as `norn-code-block` when the code sample package is installed. A tag with `@` props in a `.md` page works, and so does one inside `<template webc:type="11ty" 11ty:type="md" webc:nokeep>`. A fence or code span stays literal. The README's "Components in Markdown" lists the routes to avoid.

## Styling and theming

- **The global tokens are the whole styling API.** There are about 47, named `--norn-<group>-<name>` (`--norn-ui-accent`, `--norn-surface-raised`, `--norn-space-m`, `--norn-font-body`). Override any of them in the project's own stylesheet, usually `:root { --norn-ui-accent: #1f6f8b; }`, and every component follows. Each component reads a token with its default compiled in, so nothing has to define them.
- **A component has no custom property of its own.** Never set `--norn-card-bg` or any `--norn-<component>-*`: it does not exist. A per-instance setting is a prop (`@accent`, `@gap`, `@size`, `@chrome`).
- **To restyle one component**, write CSS against its tag in the project's own unlayered stylesheet. It beats the component's layered CSS. Reach the component's own markup by a child path (`norn-card-grid > ul`), not a descendant path, so slotted content is left alone.
- **Layers**: `norn.reset, norn.base, norn.layout, norn.components, norn.oss, norn.print`. A project's unlayered CSS wins over all of them.
- Do not add classes to components, use `!important`, or restyle with selectors that depend on a component's inner markup beyond a child path.
- The reset (`css/reset.css`) is optional. Components look the same without it.
- Browsers: evergreen from about 2024. Newer features, such as `@scope` and the CSS Custom Highlight API, degrade to readable content.

## Accessibility

Components meet WCAG 2.2 AA in light, dark, and forced colors. Keep it that way: give every image an `alt`, every landmark a name (the component's name slot), keep heading levels in order, and do not remove a focus ring. A link inside running text keeps a cue other than color.

## Hooks

`norn-base` has four hooks: `head`, `banner`, `cta`, `credit`. Add markup with `fillHooks(config, { head: "…" })` from `@allons-y/webc-patterns/plugin`. Fills append, an unknown name throws, and page data cannot change a hook.

## Project data

`@allons-y/webc-patterns/project` has builders that read `package.json` and `project.json`: `buildSite`, `buildWorkspaces`, `npmRelease`, `accentHex`. The `project.json` schema is at `@allons-y/webc-patterns/schema/project.schema.json`: features take `title` and `description`, packages take `title` and `description`, both with an optional `href`. A project sets settings such as flavor in `package.json`, not in `project.json`.

## Common mistakes

- Registering `@11ty/eleventy-plugin-webc` yourself. Pass extra component globs as the `components` option.
- Naming a project layout `norn-*.webc`. Pass `layouts: ["norn-landing"]` to leave a shipped one out, then supply your own.
- Writing item data with `url`, `name`, or `body`.
- Putting text in an attribute (such as `@label`) where the component has a slot.
- Setting a component custom property that does not exist.
- Using `$data.site` or `$data.project` in a layout. Layouts read `$data.norn` (from `props`), `$data.page`, and `$data.content`.
- A dynamic `style` or `class` that can be `undefined`: it throws. Return `''`.
- Putting an HTML comment in a component: it ships to every page.

## Where to look next

- README: install, every layout's props, theming, translating, the exports.
- Component preview: https://allonsy-studio.github.io/webc-resources/ (every component with its stories and tokens).
- Working projects: the `fixtures/` folders in the repository (landing, docs, workspaces, neutral).
