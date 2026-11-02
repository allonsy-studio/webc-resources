# @allons-y/webc-oss-site

The OSS site theme for [Norn](https://github.com/allonsy-studio/webc-resources#readme) sites: the Allons-y Studio brand tokens, the self-hosted fonts, & the locked OSS banner, call to action, & footer credit. Everything generic, the layouts & the data builders included, lives in [`@allons-y/webc-patterns`](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-patterns#readme).

See it in the [component preview](https://allonsy-studio.github.io/webc-resources/).

Using an AI coding agent? Point it at [`llms.txt`](llms.txt): the rules for calling & styling the components, & a reference of every prop, slot, & token.

## Status

Beta. Versions are `0.1.0-beta.N` until 1.0.

## Install

```sh
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-webc @allons-y/webc-oss-site @allons-y/webc-patterns
npm install --save-dev @allons-y/webc-code-sample   # optional: highlighted code samples
```

`@allons-y/webc-patterns` is a peer dependency: the OSS site plugin adds its Norn plugin. The project is an ES module (`"type": "module"`). Node 22 or later.

Evergreen browsers from about 2024. Features newer than that degrade gracefully.

## Use it

Add the OSS site plugin in place of the Norn plugin, with the same options. It adds the Norn plugin with the OSS components, fills `norn-base`'s hooks, embeds the brand tokens, sets the theme color, & copies the fonts to `assets/fonts`:

```js
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import { fillHooks } from "@allons-y/webc-patterns/plugin";
import oss, { ossProps } from "@allons-y/webc-oss-site";

const docsOf = (data) => (data.collections?.docs ?? []).map((page) => ({ href: page.url, title: page.data.title, description: page.data.description }));

export default function (config) {
	config.addPlugin(oss, {
		props: (data) => ({ ...ossProps(data.site, data.project, { docs: docsOf(data), anchors: data.anchors === true }), title: data.title, docs: docsOf(data) }),
	});
	fillHooks(config, { head: '<link rel="stylesheet" href="/assets/styles/project.css" webc:keep />' });
	config.addPlugin(HtmlBasePlugin);

	return { markdownTemplateEngine: false /* …dir, templateFormats, pathPrefix */ };
}
```

Pages pick a layout from the patterns package: `norn-landing.webc`, `norn-docs-home.webc` & `norn-docs.webc`, or `norn-workspaces-home.webc` & `norn-workspace.webc`. Its README lists each layout's props & shows how to [copy a layout](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-patterns#copy-a-layout) to change it. Don't add the Norn plugin as well: the OSS site plugin adds it, & a second one fails the build. The project's own `fillHooks` calls append after the theme's.

The site data comes from the patterns package's builders, one line per data file. Pass the theme's `host` so a project without its own URL gets its path on Allons-y Studio's pages host:

```js
// _data/site.js
import path from "node:path";
import { buildSite } from "@allons-y/webc-patterns/project";
import { host } from "@allons-y/webc-oss-site";

export default () =>
	buildSite({
		packagePath: path.resolve(import.meta.dirname, "../../package.json"),
		projectPath: path.join(import.meta.dirname, "project.json"),
		host,
	});
```

For the npm badges in the footer, add `npmRelease` & `badgeColor` to the site data, from the patterns package's `npmRelease` & `accentHex`. The [landing](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/landing), [docs](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/docs), & [workspaces](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/workspaces) fixtures are complete working projects.

### ossProps

`ossProps(site, project, { docs, anchors, oss })` maps the site facts from `buildSite` & a `project.json` to the layout props, with the OSS site theme's link set in English: the header's section anchors (with `anchors`), Docs (with a book icon, when `docs` has pages), GitHub, & npm links; the footer's name, tagline, npm badges once the package is released, license, & the Project & Help groups. Conduct & security links come from the project's own files first, then Allons-y Studio's policies; `oss: false` leaves them out. A project adds its page's own props, such as `title`, `docs`, & `ogImage`, after it. It never throws on missing data.

## Components

| Component | Locked | What it does |
| --- | --- | --- |
| `oss-bar` | Yes | The banner, in the `banner` hook before the header |
| `oss-cta` | Yes | The call to action that closes `main`, in the `cta` hook, with the Allons-y Studio name signed in Yellowtail. The only place Allons-y Studio's contact address appears |
| `oss-credit` | Yes | The footer credit, in the `credit` hook, light or dark by the visitor's scheme, cropped to the art |
| `oss-head` | No | The `head` hook: the PT Mono preload & the self-hosted `@font-face` rules, with a fallback matched to each font's metrics |

The Allons-y Studio SVGs are inlined into the three locked components when the package is packed, from the org's `.github` repository, so the package exports no asset folder for them. Each has an accessible name, or is marked decorative. A packed install needs network access once, at pack time; set `OSS_ASSETS` to a local checkout's `assets` folder to pack offline.

## The brand

The theme is two files in the `norn.oss` layer, which the plugin embeds in every page's bundle: `css/tokens.css` sets shared tokens, & `css/brand.css` styles the Norn components by their tags. A project's unlayered CSS still wins over each of them.

| Token | Allons-y Studio value |
| --- | --- |
| `--norn-font-mono` | PT Mono, Allons-y Studio's locked monospace |

| Rule in `css/brand.css` | Allons-y Studio look |
| --- | --- |
| `norn-header > header::after` | The four-color strip along the header bar |
| `norn-footer > footer > div:first-child > :first-child strong:first-of-type` | The footer's project name in the accent color & the mono face, at 1.2rem |

The plugin also sets the theme color, `#33394e`, & `og:locale`, `en_US`, as prop defaults under the project's mapping.

## Exports

| Export | Purpose |
| --- | --- |
| `default` | The OSS site plugin, `config.addPlugin(oss, options)`, with the Norn plugin's options |
| `ossProps(site, project, options)` | Layout props from the site facts & `project.json`, with the OSS site theme's link set |
| `ossEnabled({ packagePath })` | False when the project's `package.json` sets `"oss-docs": { "oss": false }` |
| `host` | Allons-y Studio's pages host, for `buildSite` |
| `policies` | Allons-y Studio's conduct & security policy URLs |
| `components` | Absolute glob for the OSS components, which the plugin adds |
| `tokens` | Absolute path to `css/tokens.css` |
| `brand` | Absolute path to `css/brand.css` |
| `fonts` | Absolute path to the self-hosted font files, which the plugin copies to `assets/fonts` |

The schema for the `oss-docs` settings is exported as `@allons-y/webc-oss-site/schema/oss-docs.schema.json`, the brand tokens as `@allons-y/webc-oss-site/css/tokens.css`, & the brand rules as `@allons-y/webc-oss-site/css/brand.css`.

## The OSS lock

A project component named `oss-bar.webc`, `oss-cta.webc`, or `oss-credit.webc` collides with the packaged one & fails the build, & no page data can remove the hook fills. Opting out is a setting: with `"oss-docs": { "oss": false }` in the project's `package.json`, the project's config adds the Norn plugin in place of the OSS site plugin (`ossEnabled` reads the setting), & passes `oss: false` to `ossProps`. No banner, call to action, credit, OSS CSS, or Allons-y Studio link is left on the page.

## Notes

- **Icons come from `norn-icon`.** The Docs link carries a book, the hero facts a check, & a docs page may name a sidebar icon. Footer links & card badges have none, & `features[].icon` is not in the schema.
- **Conduct & security links** use the project's own `CODE_OF_CONDUCT.md` & `SECURITY.md` when it keeps them, & show Allons-y Studio's only when the OSS site layer is on.
- **The workspaces sidebar** is labeled "Packages", not "Documentation".
- **The OSS credit & call to action** are inline SVGs, not image files.

## License

> [MPL-2.0](LICENSE): use freely, modify as needed; changes to MPL-licensed files
> should be shared back under the same license.

---

<p align="center">
<a href="https://allons-y.studio">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-dark.png">
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-light.png">
        <img id="user-content-logo" src="https://raw.githubusercontent.com/allonsy-studio/.github/main/assets/png/oss-footer-light.png" alt="Brought to you by Allons-y Studio" width="400">
    </picture>
</a>
</p>
