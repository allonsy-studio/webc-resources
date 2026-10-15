# @allons-y/webc-oss-site

Allons-y Studio open source project site layer: the locked studio banner, call to action, and footer credit, the wiring that binds project data to the generic components, the page bodies for each site flavor, and the site data builders.

## Status

Pre-release. The package is scaffolded; components and builders land in phase 5 of the migration plan.

## Install

```sh
npm install --save-dev @allons-y/webc-oss-site @allons-y/webc-patterns @allons-y/webc-code-sample
```

The other two packages are peer dependencies: studio components use their components by tag name. The package does not register `@11ty/eleventy-plugin-webc`.

## Exports

| Export | Purpose |
| --- | --- |
| `ossSite({ exclude })` | Absolute glob for the package's components; throws if `exclude` names a `studio-*` component |
| `buildSite({ packagePath, projectPath })` | Site facts from the project's `package.json` and `project.json` |
| `computeTheme(project)` | Accent, fonts, and the token block |
| `buildWorkspaces({ root })` | One entry per workspace |

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
