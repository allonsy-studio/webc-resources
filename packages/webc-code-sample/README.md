# @allons-y/webc-code-sample

`code-sample` WebC component with build-time syntax highlighting. Prism runs at build; the browser receives token ranges for the CSS Custom Highlight API and a copy button, with no highlighter shipped.

## Status

Pre-release. The package is scaffolded; the component and helpers land in phase 2 of the migration plan.

## Install

```sh
npm install --save-dev @allons-y/webc-code-sample
```

The package does not register `@11ty/eleventy-plugin-webc`. The project registers it once and adds `codeSample` to its `components` list.

## Exports

| Export | Purpose |
| --- | --- |
| `codeSample` | Absolute path to `components/code-sample.webc` |
| `tokenRanges(code, language)` | Prism tokens as `[group, start, end][]` character offsets |
| `highlightFences(md)` | markdown-it amend that renders fenced code as `<code-sample>` |
| `loadLanguages(names)` | Prism's loader, for languages beyond the defaults |

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
