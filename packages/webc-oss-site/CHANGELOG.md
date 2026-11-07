# @allons-y/webc-oss-site

## 0.1.0-beta.4

### Minor Changes

-   2b6f0fe: Require Node 24 or later. Node 22 is no longer supported: it entered maintenance on 2025-10-21 & reaches end of life on 2027-04-30. Support follows the Node.js maintenance schedule: Node 24 (in maintenance since 2026-10-20) is supported until its end of life on 2028-04-30, & Node 26 (LTS since 2026-10-28) until 2029-04-30. CI runs on Node 26 & 24.

## 0.1.0-beta.3

### Patch Changes

-   b9bbb60: Minor dependency updates

## 0.1.0-beta.2

### Patch Changes

-   651b259: Ships `llms.txt` with each package: the rules for calling and styling the components, the data shapes, and a reference of every component's props, slots, and tokens, generated from the sources.

## 0.1.0-beta.1

### Minor Changes

-   43eb7d5: First beta: the OSS site theme for Norn sites, with the Allons-y Studio brand, built on `@allons-y/webc-patterns`.

    -   The OSS site plugin: add it in place of the Norn plugin, with the same options. It adds the Norn plugin with the OSS components, fills the page frame's hooks with `oss-head`, `oss-bar`, `oss-cta`, and `oss-credit`, embeds the brand tokens, sets the theme color and locale, and copies the fonts to `assets/fonts`.
    -   The brand in the `norn.oss` layer: `css/tokens.css` sets the mono face token, and `css/brand.css` draws the header strip and styles the footer name with CSS against the component tags.
    -   Components: `oss-head` (the font preload and the self-hosted `@font-face` rules), and the locked `oss-bar`, `oss-cta` (a yellow primary action and a 1px secondary one, with the link button's hover and press layers), and `oss-credit` (one lockup, in about half the markup, whose paint follows the page's color scheme).
    -   Helpers: `ossProps`, the OSS site theme's link set as layout props from the site facts and `project.json`; `ossEnabled`, which reads the `oss-docs` opt-out; `host`, `policies`, `components`, `tokens`, and `fonts`. The data builders and the page layouts are the patterns package's.
