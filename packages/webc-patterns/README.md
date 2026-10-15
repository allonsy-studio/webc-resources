# @allons-y/webc-patterns

Generic page and docs patterns for Eleventy sites that use WebC: head, header, footer, hero, card, card grid, side nav, docs shell, pager, and skip link. Each component carries its own CSS in-file, so a page ships only the styles of the components it uses. No runtime dependencies.

## Status

Pre-release. The package is scaffolded; components land in phases 3 and 4 of the migration plan.

## Install

```sh
npm install --save-dev @allons-y/webc-patterns
```

The package does not register `@11ty/eleventy-plugin-webc`. The project registers it once and adds this package's components to its `components` list with `patterns()`.

## Exports

| Export | Purpose |
| --- | --- |
| `patterns({ exclude })` | Absolute glob for the package's components, minus any names in `exclude` |
| `adjacent(pages, page)` | Previous and next page in a collection, for `page-pager` |

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
