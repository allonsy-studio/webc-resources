# webc-resources

WebC component packages for Eleventy sites. Each component carries its own CSS and JS, so a page ships only what it uses. Projects consume the packages by pointing their own `@11ty/eleventy-plugin-webc` registration at the installed folders.

| Package | Purpose |
| --- | --- |
| [`@allons-y/webc-patterns`](packages/webc-patterns) | Generic page and docs patterns |
| [`@allons-y/webc-code-sample`](packages/webc-code-sample) | Code sample component with build-time syntax highlighting |
| [`@allons-y/webc-oss-site`](packages/webc-oss-site) | Allons-y Studio open source site layer |

## Status

Pre-release. The workspace, tooling, and package scaffolds are in place; components land phase by phase.

## Development

Requires Node 24 or later.

```sh
yarn install
yarn lint
yarn test
yarn pack:check
```

See [AGENTS.md](AGENTS.md) for component conventions and release flow, and [CONTRIBUTING](https://github.com/allonsy-studio/.github/blob/main/CONTRIBUTING.md) for the contribution process.

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
