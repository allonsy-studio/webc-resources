# @allons-y/webc-studio

The Allons-y Studio theme for [Norn](https://github.com/allonsy-studio/webc-resources#readme) sites: the brand tokens, the self-hosted fonts, and the locked studio banner, call to action, and footer credit. Everything generic, the layouts and the data builders included, lives in [`@allons-y/webc-patterns`](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-patterns#readme).

See it in the [component preview](https://allonsy-studio.github.io/webc-resources/).

## Status

Beta. Versions are `0.1.0-beta.N` until 1.0.

## Install

```sh
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-webc @allons-y/webc-studio @allons-y/webc-patterns
npm install --save-dev @allons-y/webc-code-sample   # optional: highlighted code samples
```

`@allons-y/webc-patterns` is a peer dependency: the studio plugin adds its Norn plugin. The project is an ES module (`"type": "module"`). Node 22 or later.

Evergreen browsers from about 2024. Features newer than that degrade gracefully.

## Use it

Add the studio plugin in place of the Norn plugin, with the same options. It adds the Norn plugin with the studio components, fills `norn-base`'s hooks, embeds the brand tokens, sets the theme color, and copies the fonts to `assets/fonts`:

```js
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import { fillHooks } from "@allons-y/webc-patterns/plugin";
import studio, { studioProps } from "@allons-y/webc-studio";

const docsOf = (data) => (data.collections?.docs ?? []).map((page) => ({ url: page.url, title: page.data.title, description: page.data.description }));

export default function (config) {
	config.addPlugin(studio, {
		props: (data) => ({ ...studioProps(data.site, data.project, { docs: docsOf(data), anchors: data.anchors === true }), title: data.title, docs: docsOf(data) }),
	});
	fillHooks(config, { head: '<link rel="stylesheet" href="/assets/styles/project.css" webc:keep />' });
	config.addPlugin(HtmlBasePlugin);

	return { markdownTemplateEngine: false /* …dir, templateFormats, pathPrefix */ };
}
```

Pages pick a layout from the patterns package: `norn-landing.webc`, `norn-docs-home.webc` and `norn-docs.webc`, or `norn-workspaces.webc` and `norn-workspace.webc`. Its README lists each layout's props and shows how to [copy a layout](https://github.com/allonsy-studio/webc-resources/tree/main/packages/webc-patterns#copy-a-layout) to change it. Don't add the Norn plugin as well: the studio plugin adds it, and a second one fails the build. The project's own `fillHooks` calls append after the studio's.

The site data comes from the patterns package's builders, one line per data file. Pass the studio's `host` so a project without its own URL gets its path on the studio's pages host:

```js
// _data/site.js
import path from "node:path";
import { buildSite } from "@allons-y/webc-patterns/project";
import { host } from "@allons-y/webc-studio";

export default () =>
	buildSite({
		packagePath: path.resolve(import.meta.dirname, "../../package.json"),
		projectPath: path.join(import.meta.dirname, "project.json"),
		host,
	});
```

For the npm badges in the footer, add `npmRelease` and `badgeColor` to the site data, from the patterns package's `npmRelease` and `accentHex`. The [landing](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/landing), [docs](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/docs), and [workspaces](https://github.com/allonsy-studio/webc-resources/tree/main/fixtures/workspaces) fixtures are complete working projects.

### studioProps

`studioProps(site, project, { docs, anchors, studio })` maps the site facts from `buildSite` and a `project.json` to the layout props, with the studio's link set in English: the header's section anchors (with `anchors`), Docs (with a book icon, when `docs` has pages), GitHub, and npm links; the footer's name, tagline, npm badges once the package is released, license, and the Project and Help groups. Conduct and security links come from the project's own files first, then the studio's policies; `studio: false` leaves the studio's out. A project adds its page's own props, such as `title`, `docs`, and `ogImage`, after it. It never throws on missing data.

## Components

| Component | Locked | What it does |
| --- | --- | --- |
| `studio-bar` | Yes | The banner, in the `banner` hook before the header |
| `studio-cta` | Yes | The call to action that closes `main`, in the `cta` hook, with the studio name signed in Yellowtail. The only place the studio's contact address appears |
| `studio-credit` | Yes | The footer credit, in the `credit` hook, light or dark by the visitor's scheme, cropped to the art |
| `studio-head` | No | The `head` hook: the PT Mono preload and the self-hosted `@font-face` rules, with a fallback matched to each font's metrics |

The studio SVGs are inlined into the three locked components when the package is packed, from the org's `.github` repository, so the package exports no asset folder for them. Each has an accessible name, or is marked decorative. A packed install needs network access once, at pack time; set `STUDIO_ASSETS` to a local checkout's `assets` folder to pack offline.

## The brand

`css/tokens.css` is the theme: custom properties in the `norn.studio` layer, which the plugin embeds in every page's bundle. A project's unlayered `tokens.css` still wins over each of them.

| Token | Studio value |
| --- | --- |
| `--norn-font-mono` | PT Mono, the studio's locked monospace |
| `--norn-feature-1` to `--norn-feature-4` | The card accents: the project's accent, then studio orange, teal, and yellow |
| `--norn-code-block-dot-1` to `--norn-code-block-dot-3` | A code sample's window-bar dots: magenta, orange, and yellow |
| `--norn-header-stripe` | The four-color strip along the header bar |
| `--norn-footer-name`, `--norn-footer-name-face`, `--norn-footer-name-size` | The footer's project name in the accent color and the mono face |

The plugin also sets the theme color, `#33394e`, and `og:locale`, `en_US`, as prop defaults under the project's mapping.

## Exports

| Export | Purpose |
| --- | --- |
| `default` | The studio plugin, `config.addPlugin(studio, options)`, with the Norn plugin's options |
| `studioProps(site, project, options)` | Layout props from the site facts and `project.json`, with the studio's link set |
| `studioEnabled({ packagePath })` | False when the project's `package.json` sets `"oss-docs": { "studio": false }` |
| `host` | The studio's pages host, for `buildSite` |
| `policies` | The studio's conduct and security policy URLs |
| `components` | Absolute glob for the studio components, which the plugin adds |
| `tokens` | Absolute path to `css/tokens.css` |
| `fonts` | Absolute path to the self-hosted font files, which the plugin copies to `assets/fonts` |

The schema for the `oss-docs` settings is exported as `@allons-y/webc-studio/schema/oss-docs.schema.json`, and the brand tokens as `@allons-y/webc-studio/css/tokens.css`.

## The studio lock

A project component named `studio-bar.webc`, `studio-cta.webc`, or `studio-credit.webc` collides with the packaged one and fails the build, and no page data can remove the hook fills. Opting out is a setting: with `"oss-docs": { "studio": false }` in the project's `package.json`, the project's config adds the Norn plugin in place of the studio plugin (`studioEnabled` reads the setting), and passes `studio: false` to `studioProps`. No banner, call to action, credit, studio CSS, or studio link is left on the page.

## Notes

- **Icons come from `norn-svg-icon`.** The Docs link carries a book, the hero facts a check, and a docs page may name a sidebar icon. Footer links and card badges have none, and `features[].icon` is not in the schema.
- **Conduct and security links** use the project's own `CODE_OF_CONDUCT.md` and `SECURITY.md` when it keeps them, and show the studio's only when the studio layer is on.
- **The workspaces sidebar** is labeled "Packages", not "Documentation".
- **The studio credit and call to action** are inline SVGs, not image files.

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
