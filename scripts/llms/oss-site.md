# @allons-y/webc-oss-site

> The Allons-y Studio theme for Norn sites: brand tokens and rules, self-hosted fonts, and the locked `oss-bar`, `oss-cta`, `oss-credit`, and `oss-head` components. Use it only for Allons-y Studio open source sites. Everything generic lives in `@allons-y/webc-patterns`; read its `llms.txt` first. The reference at the end is generated from the component sources.

## What you are working with

- A plugin, `@allons-y/webc-oss-site`, that you add in place of the Norn plugin with the same options. It adds the Norn plugin, fills the four hooks (`head`, `banner`, `cta`, `credit`), embeds the brand tokens and rules, sets the theme color and locale, and copies the fonts to `assets/fonts`.
- `ossProps(site, project, { docs, anchors, oss })`: maps the site facts and `project.json` to layout props with the theme's English link set (header links, Docs, GitHub, npm, footer groups, conduct and security policies).
- The components are hook fills. A page does not call them.

## Rules

- **Never add the Norn plugin as well.** The OSS plugin adds it, and a second registration fails the build.
- **`oss-bar`, `oss-cta`, `oss-credit` are locked.** A project file with one of those names fails the build. A project opts out of the whole studio layer with `"oss-docs": { "oss": false }` in `package.json`. Do not edit, copy, or hide them with CSS.
- The brand lives in the `norn.oss` layer: `css/tokens.css` sets the mono font token and `css/brand.css` styles the header strip and footer name with rules on the component tags. To change the look, override global tokens in the project's own stylesheet. Components have no theme hooks.
- Project-specific head markup goes through `fillHooks(config, { head: "…" })` from `@allons-y/webc-patterns/plugin`. The project's fills append after the theme's.
- Item data uses `href`, `title`, `description` like every Norn layout. `ossProps` returns it that way, and the `docs` you pass in must too.
- Site data comes from the patterns package's builders (`buildSite`, with `host` from this package). The `fixtures/landing`, `fixtures/docs`, and `fixtures/workspaces` folders are complete working projects.
- The package needs network access once at pack time to inline the org's SVGs. Set `OSS_ASSETS` to a local `assets` folder to pack offline.

## Where to look next

- README: the full plugin example, `ossProps`, the components table.
- Component preview: https://allonsy-studio.github.io/webc-resources/
