# @allons-y/webc-patterns

Part of [Norn](https://github.com/allonsy-studio/webc-resources#readme). Generic page and docs patterns for Eleventy sites that use WebC: the page frame and docs shell as Eleventy layouts, and the components they are built from, such as the header, footer, hero, cards, side nav, pager, skip link, icons, link buttons, and tags. One Eleventy plugin registers all of it. Content goes in slots: a component styles the markup it's given. Each component carries its own CSS in-file, so a page ships only the styles of the components it uses.

See it in the [component preview](https://allonsy-studio.github.io/webc-resources/).

## Status

Beta. Versions are `0.1.0-beta.N` until 1.0.

## Install

```sh
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-webc @allons-y/webc-patterns
npm install --save-dev @allons-y/webc-code-sample   # optional: highlighted code samples
```

`@11ty/eleventy` and `@11ty/eleventy-plugin-webc` are peer dependencies. `@allons-y/webc-code-sample` is an optional one: with it installed, the plugin registers `norn-code-block` and highlights Markdown fences, and the layouts show code with it; without it, the plugin registers a plain `norn-code-block` under the same tag, so a hand-written sample and the layouts' samples show as `<pre><code>`, with their `id` and caption. The project is an ES module (`"type": "module"`). Node 22 or later.

Evergreen browsers from about 2024. Features newer than that, such as `@scope`, degrade gracefully.

## Setup

Add the Norn plugin, with a `props` function that maps a page's data, in whatever shape the project keeps it, to the layout props:

```js
import norn from "@allons-y/webc-patterns/plugin";

export default function (config) {
	config.addPlugin(norn, {
		props: (data) => ({ title: data.title, name: "My project", nav: [{ url: "/docs/", title: "Docs" }] }),
	});

	return { markdownTemplateEngine: false };
}
```

Then pick a layout per page in its front matter: `layout: norn-docs.webc`. The plugin owns the project's one `@11ty/eleventy-plugin-webc` registration: pass more component globs as `components`, and don't add the WebC plugin separately. For the OSS site theme, add `@allons-y/webc-oss-site`'s plugin in place of this one (see its [README](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-oss-site#readme)).

| Option | Default | Does |
| --- | --- | --- |
| `props` | the same-named page data | Maps a page's data to the layout props, added as `eleventyComputed.norn` |
| `layouts` | `true` | `false` ships no layout; a list of names, as `["norn-landing"]`, leaves those out so the project can supply its own |
| `components` | `[]` | More component globs: a theme's, the project's `_includes/*.webc` |
| `exclude` | `[]` | Packaged components to leave out, so the project can supply its own |
| `strings` | `{}` | The site's strings for every component and layout (see Translating) |
| `markdown` | `true` | Amend Markdown with the add-ons below |
| `defaults` | `{}` | Prop values a theme sets, under the mapping's |
| `icons` | none | Project icons for `norn-icon` (see Project icons) |

The plugin registers:

- `@11ty/eleventy-plugin-webc` once, with the patterns components, `norn-code-block` from the code sample when it is installed (else the plain one), and the `components` globs.
- The six layouts, under the project's configured layouts folder (or its includes folder), through `addTemplate`.
- The helpers the components and layouts call: `nornAdjacent`, `nornHeadings`, `nornComponentStrings`, `nornHook`, `nornIcons`, `nornCompiles`, and `nornTokenRanges` with the code sample.
- With `markdown`, the Markdown add-ons through `amendLibrary`: `webcTags`, `highlightFences` from the code sample, `scrollTables`, `callouts`, `singleTitle`, and `headingAnchors`.
- `dropEmptyBundleTags` as a transform, so a page with no CSS or JS keeps no empty `<link>` or `<script>`.

### Project icons

`norn-icon` draws the project's own icons beside its built-in set. Name them in the plugin's `icons` option, as a glob or a list of globs of `.svg` files, each named for its file without the extension, or as a record of names to a path or `{ src, mirror }`:

```js
config.addPlugin(norn, {
	icons: "src/icons/*.svg",
	// or: icons: { "arrow-end": { src: "src/arrow.svg", mirror: true }, logo: "src/logo.svg" },
});
```

Then `<norn-icon @name="logo"></norn-icon>`. Paths resolve against the working directory. A name is lowercase kebab case. A missing file, a bad name, or two files with one name fails the build, and so does a name no icon has: the error lists the built-in and project names.

- A project icon with a built-in's name replaces the built-in.
- The icon keeps its `viewBox`, or takes one from a numeric `width` and `height`, or gets `0 0 24 24`, and its own paint. Draw it with `currentColor` so it follows the text color; a file with no paint is filled with `currentColor`. The built-in stroke styling applies to the built-in icons only, so a filled SVG renders filled.
- The size, `<title>`, `<desc>`, scripts, and event handler attributes are dropped, and the drawing is always hidden from assistive tech. Name an icon that carries meaning in the `label` slot, as for any icon.
- Ids in the drawing, and the references to them (`url(#id)`, `href`, and a `<style>`'s `#id` selectors), are prefixed with `norn-icon-` and the icon's name. Inlined icons share the page's one id space, so two icons that each define `id="a"` would otherwise clip and fill each other.
- `mirror: true` flips the icon in right-to-left text, as the built-in arrows do.

Without the plugin, `norn-icon` draws the built-in set only.

Without the plugin, register the components as `patterns()` (or `npm:@allons-y/webc-patterns/components/*.webc`) in the project's own WebC `components` list. The layouts, helpers, and Markdown add-ons are then the project's to wire up.

### Layout props

The layouts read their props as `$data.norn`. Without `props`, each prop is read off the page data of the same name. Every list defaults to `[]`, and a value that is not a list counts as empty. Eleventy also runs the mapping against placeholder data to learn what it reads, so it must not throw on missing data: write `data.collections?.docs ?? []`, not `data.collections.docs`. `norn` is a reserved data key: a page, or a data file, that sets it fails the build with the page's path.

One mapping serves every layout, because each layout reads only its own props and ignores the rest:

```js
config.addPlugin(norn, {
	props: (data) => ({
		title: data.title,
		name: data.site?.name,
		tagline: data.site?.tagline,
		description: data.description ?? data.site?.description,
		url: data.site?.url && new URL(data.page?.url ?? "", data.site.url).href,
		ogImage: { src: "/img/share.png", alt: data.site?.name },
		nav: [{ url: "/docs/", title: "Docs", icon: "book" }],
		footer: { license: { name: "MIT", url: "https://opensource.org/license/mit" } },
		docs: (data.collections?.docs ?? []).map((page) => ({ url: page.url, title: page.data.title })),
	}),
});
```

`norn-base` is the frame of every layout, so its props apply to all of them:

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `lang` | string | `page.lang`, then `en` | `<html lang>` |
| `dir` | `"ltr"`, `"rtl"`, or `"auto"` | `rtl` for a right-to-left `lang`, else `ltr` | `<html dir>`. Right-to-left languages are `ar`, `fa`, `he`, `ur`, `ps`, `yi`, `dv`, `ckb`, `sd`, and `ug`, matched on the primary subtag of `lang` |
| `title` | string | none | `<title>`, as "title: name"; the `<h1>` of the docs layouts |
| `name` | string | none | The brand link, the footer's lead, `og:site_name`, and the hero `<h1>`. Each is left out without one (the brand link also shows for a logo) |
| `tagline` | string | none | After the name in the title and the hero `<h1>`; the footer's text |
| `description` | string | none | `<meta name="description">` and `og:description`; the hero paragraph |
| `url` | string | none | `<link rel="canonical">` and `og:url`. Absolute, for a relative `ogImage` |
| `ogTitle` | string | the document title | `og:title` |
| `ogImage` | `{ src, alt? }` or a URL | none | `og:image`, `og:image:alt`, and `twitter:card` as `summary_large_image` |
| `locale` | string | none | `og:locale`, such as `en_US` |
| `themeColor` | string | the page surface in each scheme | `<meta name="theme-color">` |
| `themeToggle` | boolean | `false` | An inline script that applies the scheme a `norn-theme-toggle` saved, before the first paint |
| `icon` | `{ href, type? }` or a URL | an empty icon | `<link rel="icon">`. The type comes from the extension. The empty icon stops the `/favicon.ico` request |
| `touchIcon` | string | none | `<link rel="apple-touch-icon">`, a 180px PNG |
| `logo` | `{ src, alt? }` or a URL | none | An image in the header in place of the name. `alt` falls back to the name |
| `nav` | `{ url, title, icon? }[]` | `[]` | The links of `norn-header`. `icon` names a `norn-icon` |
| `footer` | object | `{ badges: [], groups: [] }` | `norn-footer`, from the fields below |
| `footer.name`, `footer.text` | string | the name, the tagline | The lead column's title and line |
| `footer.license` | `{ name, url }` | none | "Licensed under {license}", linked |
| `footer.badges` | `{ href, src, alt, width?, height? }[]` | `[]` | Linked images under the lead |
| `footer.groups` | `{ heading, links: { url, title }[] }[]` | `[]` | The footer navigation, one list per group |
| `footer.colophon` | string | none | A closing line |

A relative `ogImage.src` resolves against `url`. When `url` is not absolute, the build logs a `norn-head:` warning, leaves out `og:image` and `og:image:alt`, and sets the card to `summary`. A path with a leading slash (`/img/share.png`) resolves against the origin of `url`, one without (`share.png`) against the page. Without an image, no image tag renders and the card is `summary`.

Each of the other layouts adds its own props, below. The base props a layout reads are named under its heading.

#### `norn-base.webc`

The page frame: head, skip link, header, `main` around the content, and footer. It takes the props above. It compiles Markdown content once, so a Markdown page's callouts, code fences, and tables render as components, also through a Nunjucks or Liquid layout of the project's or a layout alias. Content that WebC already compiled goes in as it is: a WebC page, a `templateEngineOverride` with `webc`, a `{% renderTemplate "webc" %}` block, and a page on any shipped layout or on a WebC layout of the project's own. A Nunjucks, Liquid, or HTML page renders its components through `{% renderTemplate "webc" %}`. The `nornCompiles` helper decides, from `page.templateSyntax`. Every other shipped layout sets `nornCompiled: true` in its front matter, so the frame leaves the content it compiled; a WebC layout of the project's own that compiles the content and sits deeper in the chain than the page's own layout sets it too.

A `<section>` directly in `main` is a centered column at `--norn-layout-width`, with block padding, a gap, and a second-level heading style. Its `id` is the anchor. The rule is in the `norn.layout` layer under `:where(main)`, so a project rule overrides it, and a section anywhere else is left alone.

#### `norn-docs.webc`

A docs page: the sidebar with site search, the title, the contents, the body in `norn-rich-text`, and the pager. Reads `title`.

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `docs` | `{ url, title, icon? }[]` | `[]` | The sidebar's `norn-side-nav`, in order, with the current page marked |
| `prev`, `next` | `{ url, title }` | the neighbors in `docs` | The `norn-pager` |
| `search` | `{ bundle?, site? }` or `false` | the Pagefind script at `/pagefind/pagefind.js`, and the host of `url` | `norn-search` above the sidebar list. `false` leaves it out |

The contents come from `nornHeadings` over the body, so they list the headings the Markdown add-on anchors and any `norn-heading-anchor` written by hand. The layout shows the title as the page's h1, so a Markdown body keeps no h1 of its own: a leading `# Title` that repeats the title is dropped, and any other `#` heading renders as an h2 (`singleTitle`). A page 60rem wide or more has them as a sticky column beside the body; narrower, they fold under their title, and the sidebar folds into a closed `<details>` named "Documentation".

#### `norn-docs-home.webc`

The hero with the install sample, then the docs pages as a contents list, then the page body. Reads `name`, `tagline`, and `description`.

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `lede` | string | `description` | The hero paragraph |
| `install` | string | none | The install sample in the hero |
| `repo` | string | none | The "View on GitHub" button |
| `docs` | `{ url, title, description? }[]` | `[]` | The contents list, and the "Read the docs" button to the first page |

#### `norn-landing.webc`

The hero with a sample, then install, features, and packages sections, then the page body. Reads `name`, `tagline`, and `description`.

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `lede` | string | `description` | The hero paragraph |
| `repo` | string | none | The "View on GitHub" button |
| `license`, `node` | string | none | Facts under the hero, such as "License: MIT" and "Node 24+" |
| `install` | string | none | The install sample; with `usage`, its own section |
| `usage` | `{ language, code, caption? }` | none | The hero's sample |
| `features` | `{ title, body, href? }[]` | `[]` | Cards in the features section |
| `packages` | `{ name, description, href? }[]` | `[]` | Cards in the packages section, names in the mono face |

#### `norn-workspaces-home.webc`

A monorepo's home page: the hero with the install sample, then an index of the workspaces, then the page body. Reads `name`, `tagline`, and `description`.

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `lede` | string | `description` | The hero paragraph |
| `install` | string | none | The install sample |
| `repo` | string | none | The "View on GitHub" button |
| `workspaces` | `{ name, description?, url }[]` | `[]` | Cards in the packages section |

#### `norn-workspace.webc`

One workspace's page in the docs frame. Reads `title`.

| Prop | Shape | Default | Rendered as |
| --- | --- | --- | --- |
| `workspaces` | `{ url, title, icon? }[]` | `[]` | The sidebar. `name` stands in for a missing `title` |
| `workspace` | `{ name, description?, html? }` | none | The `<h1>`, the description, and `html`, compiled as WebC. The page's own content follows |

On the three home layouts, the page body follows the shipped sections in a `<section>` of its own, in `norn-rich-text`, and a page with no body renders none. Markdown there is compiled once, as on `norn-docs`.

The layouts' texts ("Get started", "Read the docs", "Packages") come from `componentStrings` under the layout's name, then English (see Translating).

### Copy a layout

The layouts ship as files in the package's `layouts/` folder. To change one, copy it into the project and turn the shipped one off:

1. Leave the layout out: `config.addPlugin(norn, { layouts: ["norn-docs"], props })`. The other five stay.
2. Copy `node_modules/@allons-y/webc-patterns/layouts/norn-docs.webc` into the project's layouts folder (`_includes/` unless `dir.layouts` says otherwise).
3. Edit the copy. It still extends `norn-base.webc` and reads `$data.norn`, so the mapping needs no change.

A file in the layouts folder with the name of a shipped layout, and no matching entry in `layouts`, fails the build: it would replace the shipped one without a word. A copy of `norn-base.webc` also needs the text of `css/base.css` and `css/print.css` pasted over its two style placeholders, which the plugin fills only in the shipped file.

### Hooks

`norn-base` has four hooks that a theme or the project fills with markup:

| Hook | Where |
| --- | --- |
| `head` | The end of `<head>`: a stylesheet, a favicon, a font preload |
| `banner` | Before the header |
| `cta` | The end of `main` |
| `credit` | The footer's last column |

```js
import { fillHooks } from "@allons-y/webc-patterns/plugin";

fillHooks(config, { head: '<link rel="stylesheet" href="/assets/tokens.css" webc:keep />', credit: "<my-credit></my-credit>" });
```

A fill is WebC markup, compiled with the page, so it may call components; give a `<link>` or `<script src>` `webc:keep`. Fills are appended in the order they are added, before or after the plugin. An unknown hook name throws, and no page data can change a hook: `norn-base` reads them through the `nornHook` helper. Fills are trusted markup, written in the config.

### Theming

A shared token is a custom property named for its path in `tokens.json`: `ui.border.color` is `--norn-ui-border-color`. Every component reads its tokens with the default compiled in as the fallback, so nothing has to define them and a component renders the same with none set. Set any of them in the project's own `tokens.css`, unlayered, and every component follows. Link it from the `head` hook, and copy the file to the output:

```css
/* assets/tokens.css */
:root {
	--norn-ui-accent: #1f6f8b;
	--norn-font-body: "Instrument Sans", system-ui, sans-serif;
	--norn-space-m: 1rem;
}
```

```js
fillHooks(config, { head: '<link rel="stylesheet" href="/assets/tokens.css" webc:keep />' });
config.addPassthroughCopy("assets");
```

The accent drives the link color (`--norn-text-accent`) and the text on an accent surface (`--norn-text-on-accent`) too, since their defaults are derived from it. The heading face (`--norn-font-heading`) follows the body face until it is set. The properties sit in no layer, so the order of the stylesheets does not matter. To read a token in the project's own CSS, give it the default as the fallback, as the components do: `var(--norn-space-m, 1.25rem)`. The component preview lists every token with its default.

| Group | Tokens |
| --- | --- |
| `ui` | `--norn-ui-accent`, `--norn-ui-border-color`, `--norn-ui-border-strong`, `--norn-ui-border-radius`, `--norn-ui-radius-s`, `--norn-ui-focus-width`, `--norn-ui-focus-offset`, `--norn-ui-state-hover`, `--norn-ui-state-press`, `--norn-ui-motion-duration`, `--norn-ui-motion-easing`, `--norn-ui-control-height`, `--norn-ui-icon-s`, `--norn-ui-icon-m`, `--norn-ui-shadow` |
| `surface` | `--norn-surface-base`, `--norn-surface-raised`, `--norn-surface-code` |
| `text` | `--norn-text-base`, `--norn-text-muted`, `--norn-text-accent`, `--norn-text-on-accent`, `--norn-text-measure` |
| `font` | `--norn-font-body`, `--norn-font-heading`, `--norn-font-mono`, `--norn-font-size-s`, `--norn-font-size-m`, `--norn-font-size-l`, `--norn-font-size-xl` |
| `code` | `--norn-code-comment`, `--norn-code-string`, `--norn-code-keyword`, `--norn-code-function`, `--norn-code-number`, `--norn-code-flag` |
| `space` | `--norn-space-2xs`, `--norn-space-xs`, `--norn-space-s`, `--norn-space-m`, `--norn-space-l`, `--norn-space-xl` |
| `layout` | `--norn-layout-width` |
| `status` | `--norn-status-info`, `--norn-status-success`, `--norn-status-warning`, `--norn-status-danger` |

A theme is a file like that, plus the components and hook fills it adds through the plugin's `components` option and `fillHooks`. A theme styles a component with CSS against its tag, in its own layer; no component exposes a custom property of its own. [`@allons-y/webc-oss-site`](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-oss-site#readme) is a theme. Its `css/tokens.css` sets the mono face, its `css/brand.css` draws the header strip and styles the footer name by the component tags, both in the `norn.oss` layer, and its plugin fills all four hooks:

```css
@layer norn.oss {
	:root {
		--norn-font-mono: "PT Mono", ui-monospace, monospace;
	}

	norn-header > header::after {
		content: "";
		position: absolute;
		inset: auto 0 0;
		block-size: 3px;
		background: linear-gradient(90deg, #d22d6f, #ff944d);
	}
}
```

### Collisions

Tag names are the file names of the components: `norn-*` for the patterns, and `oss-*` for the OSS site theme. A project component with the tag of a packaged one, a `norn-link-button.webc` of its own, fails the build with "Global component name collision". Give the project's components another prefix, or replace a packaged one on purpose by leaving it out:

```js
config.addPlugin(norn, { props, exclude: ["norn-card"], components: ["_includes/*.webc"] });
```

`exclude` throws when it names a component the package does not have. The plugin also fails, with a message that says what to remove, when:

- A file in the project's includes or layouts folder has the name of a shipped layout (see Copy a layout).
- `@11ty/eleventy-plugin-webc` is registered a second time, by the project or by another plugin.
- The Norn plugin is added twice, which includes adding it beside a theme that adds it.

### The reset

`css/reset.css` is optional, in the `norn.reset` layer: the components and layouts look the same without it. The plugin exports its path as `reset`. Copy it to the site and link it from the head hook, or embed its text:

```js
import fs from "node:fs";
import { fillHooks, reset } from "@allons-y/webc-patterns/plugin";

fillHooks(config, { head: `<style>${fs.readFileSync(reset, "utf8")}</style>` });
```

### A layout of the project's own

A layout that does not extend `norn-base` calls `norn-head` in its head, which declares the layer order and links the bundles, and adds the base and print styles, `css/base.css` and `css/print.css` (the plugin exports their paths as `base` and `print`):

```html
<!doctype html>
<html lang="en">
	<head>
		<meta webc:is="norn-head" webc:nokeep :@title="title" :@description="description" />
		<link rel="stylesheet" href="/assets/norn/base.css" webc:keep />
		<link rel="stylesheet" href="/assets/norn/print.css" webc:keep />
	</head>
	<body>
		<norn-skip-link></norn-skip-link>
		<main id="main" tabindex="-1"><template webc:nokeep @html="content"></template></main>
	</body>
</html>
```

- **Render a Markdown page's `content` with `@html`.** WebC then compiles the `norn-callout` and `norn-code-block` tags the add-ons write.
- **Call head components with `<meta webc:is>`.** A custom tag in `<head>` makes the parser close the head early, so a head component is called as a `<meta>` with `webc:is` and `webc:nokeep`. A void tag has no children, so `norn-head` has no slot: write extra head tags after it.
- **The layer order comes first.** `norn-head` declares it in an inline style ahead of the bundle links, so it holds whatever order the page's styles bundle in.
- **Link bundles with `webc:keep`.** WebC removes `<link>` and `<script src>` without it. `norn-head` does this for the bundles.
- **Every packaged layer sits inside one `norn` layer:** `norn.reset`, `norn.base`, `norn.layout`, `norn.components`, `norn.oss`, `norn.print`. A project that uses its own layers, or a framework such as Tailwind, orders the whole package with one name, as in `@layer norn, base, components, utilities;`, and no layer names collide.
- **Project CSS stays unlayered.** It beats every layer without `!important`.
- **`.visually-hidden` hides text but keeps it read.** `css/base.css` defines it. It shows again while it or a child has focus.

Copy the two stylesheets to the output with `addPassthroughCopy`, or embed their text as `norn-base` does. See the [neutral fixture](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/neutral) for a working site on the plugin and the layouts, with no theme.

### Markdown

The components are made for hand-written HTML. The plugin's Markdown add-ons turn Markdown into the markup an author would write for the same components. Without the plugin, amend the library yourself:

```js
import { callouts, headingAnchors, headings, scrollTables, singleTitle, webcTags } from "@allons-y/webc-patterns/markdown";

config.amendLibrary("md", webcTags);
config.amendLibrary("md", scrollTables);
config.amendLibrary("md", callouts);
config.amendLibrary("md", singleTitle);
config.amendLibrary("md", headingAnchors);
config.addJavaScriptFunction("nornHeadings", headings);
```

- `webcTags` keeps a component tag with WebC attributes (`@variant`, `:@level`, `webc:if`) as HTML. Without it, markdown-it escapes the tag to text: CommonMark's attribute names have no `@`. It acts only on custom elements, names with a hyphen, and only when the library's `html` option is on, as it is in Eleventy. It also gives a `<script>` or a `<link>` in Markdown `webc:keep`, so an embed (`<script async src="https://…">`, `<script src="/local.js">`) reaches the browser as written: without it, WebC fails the build on a full URL or a site path, and moves an inline script into the page bundle. Where a layout inserts the HTML without compiling it, the attribute stays in the output, where browsers ignore it.
- `scrollTables` wraps each table in `norn-simple-table`.
- `callouts` turns a `> [!NOTE]` blockquote into a `norn-callout` of that kind.
- `singleTitle` keeps a page on `norn-docs` or `norn-workspace`, which show the title as their h1, to one h1: a leading `# Title` that repeats the title goes, and any other h1 becomes an h2. `{ layouts }` names a project layout that shows the title too.
- `headingAnchors` renders each h2 and h3 as `norn-heading-anchor`, with an id from `slugify`, as an author writes it: `## Install` becomes `<norn-heading-anchor @slug="install">Install</norn-heading-anchor>`. A heading whose text holds a link keeps that link and gets the id only, since a link can't hold another. Like the callouts, the tag needs WebC to compile it: on a layout that doesn't, such as a Nunjucks one of the project's own, or in a feed built from `templateContent`, it stays an uncompiled tag.
- `headings(html)` lists the anchored headings for `norn-toc`, from compiled HTML or from Markdown output that WebC has not compiled yet, `norn-heading-anchor` tags included. Register it as `nornHeadings`.
- `slugify(text)` is the id function `headingAnchors` uses. It keeps the letters and digits of any script (`## 日本語の見出し` gets `id="日本語の見出し"`), lowercases them, takes the accents off Latin letters, and joins the rest with hyphens. A repeated heading gets `-2`, `-3`, and so on, counted across the page, so two Markdown blocks on one page never share an id.

The add-on writes only what an author would write by hand, and no text of its own. A callout title, a code block's labels, and every other string come from the component's slots, which fall back to `componentStrings` and then English (see Translating).

### Components in Markdown

Write a component in Markdown as its tag, with its props, as in a WebC file. Two routes work:

- A Markdown page (`.md`) on `norn-base` or `norn-docs`. The layout compiles the page's HTML as WebC.
- A WebC page with Markdown blocks, for a page that is mostly components:

  ```html
  <template webc:type="11ty" 11ty:type="md" webc:nokeep>
  ## Install

  Run the installer once.
  </template>
  <norn-callout @variant="tip">
  	<span slot="heading">Before you start</span>
  	<template webc:type="11ty" 11ty:type="md" webc:nokeep>
  Back up the **config** first.
  	</template>
  </norn-callout>
  ```

  plugin-webc renders each block with the site's Markdown library, so the add-ons apply, and the page then compiles the output. Keep the Markdown in a block flush left: an indented `## Heading` renders as a paragraph. `11ty:type="liquid,md"` runs Liquid first, for page data.

In both routes:

- A block component takes its open tag alone on a line, a blank line, the Markdown body, a blank line, and its close tag alone on a line. Without the blank lines, CommonMark keeps the body as raw HTML, so `**bold**` stays literal. On one line with text, the component lands inside a `<p>`.
- An inline component, such as `norn-icon` or `norn-link-button`, may sit in a sentence.
- A tag fits on one line. CommonMark reads no HTML tag whose attributes span lines.
- Code spans and fences stay literal: `` `<norn-icon @name="info">` `` shows the tag.
- A `<script>` or `<link>` stays where it is written, for the browser, and WebC's bundler leaves it alone.
- The content is compiled as WebC, so it is as trusted as a `.webc` file: a dynamic attribute (`:data-x="…"`) runs at build time. Render content from outside the repository with `markdown: false` or through `@raw`.

Avoid `markdownTemplateEngine: "webc"`. WebC then runs before Markdown, and Markdown parses WebC's output again: a blank line in a component's output turns into a paragraph, `> [!TIP]` loses its `>`, a tag in a fence is compiled, so a code sample shows rendered HTML, and any dynamic attribute in the page text runs at build time. Keep `markdownTemplateEngine: false`, as in Setup, and use one of the two routes above.

### Project data

`@allons-y/webc-patterns/project` has optional builders for the data a project site maps to the props. They read files; nothing in Norn reads their output unless the project's mapping passes it on.

| Export | Purpose |
| --- | --- |
| `buildSite({ packagePath, projectPath, host })` | Site facts from `package.json` and `project.json`: name, tagline, description, license, repository links, the Node version, and the URL (the project's, or `host` plus the repository name) |
| `buildWorkspaces({ root })` | One entry per workspace: its `package.json` and its SKILL.md or README.md, rendered with the site's Markdown add-ons, so headings get the same ids and anchors as a docs page. The README's raw HTML renders as HTML, as on GitHub. Nothing is sanitized: the README is the project's own, and `norn-workspace` compiles it as WebC, as trusted as any page |
| `npmRelease(packageName)` | Whether the package has a `latest` release on npm, for badges. Cached an hour; offline is no release |
| `accentHex(cssPath)` | The `--norn-ui-accent` hex digits a stylesheet sets, for a badge color |

The `project.json` schema is `@allons-y/webc-patterns/schema/project.schema.json`.

## Components

| Component | Props and slots | Purpose |
| --- | --- | --- |
| `norn-head` | `@title`, `@description`, `@url`, `@theme-color`, `@og-title`, `@og-image`, `@og-image-alt`, `:@theme-toggle` | Head metadata, Open Graph and Twitter card tags, the layer order, and the bundle links. `norn-base` calls it |
| `norn-skip-link` | `@href`, slot `label` (the text) | Link past the page chrome to the main content |
| `norn-header` | slot `brand` (the home link), default slot (the links), slots `label` and `summary`, `@logo-height` (a CSS length, 2rem by default) | Brand link and primary navigation. Below 40rem the links fold into a closed `<details>` |
| `norn-footer` | default slot (the columns), slot `colophon`, `@width` and `@lead-width` (CSS lengths) | Footer lock-up: a lead column up to 25rem, then columns sized to their content |
| `norn-hero` | `@width` (`layout` or `measure`), default slot (h1, lede, actions, `norn-fact-list` with `@gap="l"`, extras) | Page intro |
| `norn-card` | `@accent` (`accent`, `info`, `success`, `warning`, `danger`, or `none`), `@title-face` (`mono`), default slot (a heading, then the body) | Card on a raised surface. A heading link covers the whole card, and an accent draws a 2px line along the top |
| `norn-card-grid` | `@gap` (`s`, `m`, or `l`), `@min` (a length), default slot (`<li>` cards) | Responsive grid of cards |
| `norn-side-nav` | `:@items` (`{ url, title, icon?, children? }[]`), slots `label` and `search` | Page links, with `aria-current` on the current page and its parent |
| `norn-sidebar-layout` | slots `nav` and `summary`, default slot (the body, from its h1), `@nav-width` (a CSS length), `@gap` (`s`, `m`, `l`, `xl`), `@columns` (the body's grid columns) | Navigation column beside a page body. The navigation stays in view; below 37.5rem the columns stack and the navigation folds into a closed `<details>` |
| `norn-rich-text` | `@measure` (`text` or `none`), default slot | Prose styles for long-form content |
| `norn-pager` | `:@prev`, `:@next` (`{ url, title }`), slot `label` | Links to the neighboring pages |
| `norn-link-button` | `@href`, `@variant` (`primary`, `secondary`, or `quiet`), default slot | A link styled as a button, for a call to action |
| `norn-fact-list` | `@gap` (`xs`, `s`, `m`, or `l`, the space between rows), default slot (`<li>` facts) | A row of short facts, each with an optional icon |
| `norn-segmented-control` | `:@icon-only`, slot `legend`, default slot of `<label>` + radio, or `@legend`, `@name`, `:@options` | One choice from a few, from native radios. The checked option is tinted in the accent |
| `norn-theme-toggle` | slots `label`, `light`, `system`, `dark` | Light, system, or dark, saved in this browser. Hidden without a script. Pair with `norn-head`'s `:@theme-toggle="true"` |
| `norn-copy-button` | `@value` or `@source` (an id), `:@compact`, `@surface` (`base`, `raised`, or `code`), slots `copy`, `copied`, `failed`, `label` | Copies text and says so. Hidden where the Clipboard API is missing |
| `norn-simple-table` | default slot (a `<table>`), slot `label` | A wide table scrolls in its own box, with a shadow at the edge that has more, and a tab stop named by the caption while it scrolls |
| `norn-notice` | `@severity` (`info`, `success`, `warning`, `error`), `:@live`, default slot, slots `prefix` and `action` | A message about the page, with an icon and a severity word read first |
| `norn-callout` | `@variant` (`note`, `tip`, `important`, `warning`, `caution`), slot `heading`, default slot | An aside in long-form text, set like a pull quote on a raised panel with an eyebrow label, as `role="note"`. For a status message, use `norn-notice` |
| `norn-accordion` | default slot (`<details>` sections) | Disclosures from native `details`. Give them one `name` to open one at a time |
| `norn-heading-anchor` | `@slug`, `:@level`, default slot | A heading whose text links to its own section |
| `norn-toc` | `:@items` (`{ id, text, level }[]`, from `nornHeadings`), slot `label` | The page's contents, marking the section in view. Folds under its title when `--norn-toc-fold: on` is set |
| `norn-breadcrumbs` | `:@items` (`{ url, title }[]`), slot `label` | The trail to the current page, with chevrons that mirror in right-to-left text |
| `norn-code-tabs` | `@group`, default slot (`norn-code-block`s), slots `label` and `sample` | Tabs over code samples, kept in step by group; stacked without a script |
| `norn-search` | `@bundle`, `@action`, `@site`, slots `label`, `none`, `results-one`, `results-other` (and `-zero`, `-two`, `-few`, `-many`) | Live results from a Pagefind index; a plain web search form without one |
| `norn-icon` | `@name`, `@size` (`s` or `m`), slot `label` | An inline icon from a built-in set or the plugin's `icons` option, at 1em, or the title size for `m`. Decorative unless it has a label; directional icons mirror in right-to-left text |

A component is styled through the shared tokens in `tokens.json` (`--norn-ui-accent`, `--norn-ui-border-color`, `--norn-space-m`, and so on). The component preview lists the tokens each one reads, from its source. Each token falls back to its default, compiled into the component, so a component renders the same with no tokens set, and no stylesheet defines them. A custom property of a component's own is not part of its documented API.

### Pager

`norn-docs` links the neighbors itself. In a page of the project's own, `adjacent` returns the pages around the current one: map them to `{ url, title }` at the call site, and keep the lookup in the expression: a `webc:setup` block in a layout runs once per template, so a value computed there is shared by every page.

```html
<norn-pager
	:@prev="link(nornAdjacent($data.collections.docs, $data.page).prev)"
	:@next="link(nornAdjacent($data.collections.docs, $data.page).next)"
></norn-pager>
```

Here `link` is a pure helper in the layout's `webc:setup` block: `(page) => (page ? { url: page.url, title: page.data.title } : undefined)`.

### Translating

Every string a visitor sees or hears, accessible names and text a script shows included, is content in the page: a named slot on the component. Fill the slot on the tag for one instance, as `<span slot="label">Rechercher</span>`. An empty slot falls back to the site's strings from `componentStrings`, then to the English default:

```html
<norn-search @bundle="/pagefind/pagefind.js">
	<span slot="label">Rechercher</span>
	<span slot="results-one">{count} résultat</span>
	<span slot="results-other">{count} résultats</span>
</norn-search>
```

A line break inside the tag leaves every named slot's fallback in place, so `<norn-skip-link>` and `</norn-skip-link>` can sit on their own lines. Set the strings once for the whole site with the plugin's `strings` option, keyed by component and slot name. The plugin registers them through `componentStrings`:

```js
config.addPlugin(norn, {
	props,
	strings: {
		"norn-skip-link": { label: "Aller au contenu" },
		"norn-toc": { label: "Sur cette page" },
		"norn-search": { label: "Rechercher", none: "Aucun résultat", "results-one": "{count} résultat", "results-other": "{count} résultats" },
		"norn-callout": { note: "Remarque", tip: "Astuce" },
		"norn-landing": { start: "Commencer", license: "Licence : {license}" },
	},
});
```

A layout has no caller to fill a slot, so its texts are keys of their own under the layout's name: `norn-landing`'s `start` ("Get started") and `license` ("License: {license}"), `norn-base`'s `license` ("Licensed under {license}"), and so on. `defaultStrings` lists every component, layout, and key with its English default. A key is the slot it fills; `norn-callout`'s `heading` and `norn-notice`'s `prefix` take one key per variant or severity, and `norn-code-block` reads its button texts from the `norn-copy-button` keys. An unknown component or key fails the build with the list of valid ones. For a site in several languages, key the tables by language tag, as `{ fr: { … }, de: { … } }`: each page picks its table by `page.lang`, which [Eleventy's i18n plugin](https://www.11ty.dev/docs/plugins/i18n/) sets from the URL (`/fr/…`), and `fr-CA` falls back to `fr`. `norn-base` sets `<html lang>` from the `lang` prop, which falls back to `page.lang`. Then:

- A landmark names itself with `aria-labelledby`, pointing at its own text: the title of `norn-toc`, or visually hidden text in `norn-header`, `norn-side-nav`, `norn-pager`, and `norn-breadcrumbs`.
- Text only a script shows sits in the page as hidden elements that the script reads: `norn-copy-button`'s texts, `norn-search`'s statuses, `norn-theme-toggle`'s names, and `norn-code-tabs`'s fallback tab name.
- `norn-search` picks `results-one`, `results-other`, or another plural form with `Intl.PluralRules` for the nearest `lang`, and formats the count for it. `{count}` stands in for the number. An empty form falls back to `results-other`.
- `norn-notice`'s `prefix` carries its own punctuation, as in `"Remarque : "`.
- `norn-simple-table` without a caption or a `label` slot names its scroll box from the column headings, so it needs no string of its own.
- Markdown callouts take their titles from `componentStrings`, like any callout: the Markdown add-on writes no `heading` slot.
- `norn-pager`'s arrows are drawn in CSS and point the other way in right-to-left text.

## Exports

| Export | Purpose |
| --- | --- |
| `patterns({ exclude })` | Absolute glob for the package's components, minus any names in `exclude` |
| `adjacent(pages, page)` | Previous and next page in a collection, for `norn-pager` |
| `dropEmptyBundleTags` | Eleventy transform that drops the empty bundle tags a page without bundles is left with |
| `componentStrings(table)` | Site-wide fallbacks for the strings, by component or layout and key, or by language tag, as the `nornComponentStrings` helper |
| `defaultStrings` | Every component and layout string and its English default, by name and key |

`@allons-y/webc-patterns/plugin` exports the plugin:

| Export | Purpose |
| --- | --- |
| `default` | The Norn plugin, `config.addPlugin(norn, options)` |
| `fillHooks(config, { head, banner, cta, credit })` | Adds markup to `norn-base`'s hooks |
| `reset`, `base`, `print` | Absolute paths to `css/reset.css`, `css/base.css`, and `css/print.css` |
| `HOOKS`, `LAYOUTS` | The hook names and the layout names |
| `compiles(data, layout, aliases)` | Whether a shipped layout compiles the page content: the rule behind `nornCompiles` |

`@allons-y/webc-patterns/markdown` exports the Markdown add-on:

| Export | Purpose |
| --- | --- |
| `webcTags(md)` | markdown-it amend that keeps component tags with WebC attributes, such as `@variant`, as HTML |
| `scrollTables(md)` | markdown-it amend that wraps each table in `norn-simple-table` |
| `callouts(md)` | markdown-it amend that renders `> [!NOTE]` blockquotes as `norn-callout` |
| `singleTitle(md, { layouts })` | markdown-it amend that drops a leading h1 that repeats the title, and turns any other h1 into an h2, on `norn-docs` and `norn-workspace` by default |
| `headingAnchors(md, { levels })` | markdown-it amend that renders headings as `norn-heading-anchor` with an id; levels 2 and 3 by default |
| `headings(html, { levels })` | The anchored headings of rendered HTML or Markdown output as `{ id, text, level }[]`, for `norn-toc`; register it as `nornHeadings` |
| `slugify(text)` | The URL fragment `headingAnchors` makes from heading text, in any script |

`@allons-y/webc-patterns/project` exports the project data builders above. The stylesheets are exported as `@allons-y/webc-patterns/css/reset.css`, `/css/base.css`, and `/css/print.css`, and the schema as `@allons-y/webc-patterns/schema/project.schema.json`.

## License

[MPL-2.0](LICENSE): use freely, modify as needed; changes to MPL-licensed files should be shared back under the same license.

<p align="center">
<a href="https://allons-y.studio">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-dark.png">
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-light.png">
        <img id="user-content-logo" src="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-light.png" alt="Brought to you by Allons-y Studio" width="400">
    </picture>
</a>
</p>
