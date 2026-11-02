# @allons-y/webc-oss-site

## 0.1.0-beta.1

### Minor Changes

-   43eb7d5: First beta: the OSS site theme for Norn sites, with the Allons-y Studio brand, built on `@allons-y/webc-patterns`.

    -   The OSS site plugin: add it in place of the Norn plugin, with the same options. It adds the Norn plugin with the OSS components, fills the page frame's hooks with `oss-head`, `oss-bar`, `oss-cta`, and `oss-credit`, embeds the brand tokens, sets the theme color and locale, and copies the fonts to `assets/fonts`.
    -   The brand in the `norn.oss` layer: `css/tokens.css` sets the mono face token, and `css/brand.css` draws the header strip and styles the footer name with CSS against the component tags.
    -   Components: `oss-head` (the font preload and the self-hosted `@font-face` rules), and the locked `oss-bar`, `oss-cta` (a yellow primary action and a 1px secondary one, with the link button's hover and press layers), and `oss-credit` (one lockup, in about half the markup, whose paint follows the page's color scheme).
    -   Helpers: `ossProps`, the OSS site theme's link set as layout props from the site facts and `project.json`; `ossEnabled`, which reads the `oss-docs` opt-out; `host`, `policies`, `components`, `tokens`, and `fonts`. The data builders and the page layouts are the patterns package's.
