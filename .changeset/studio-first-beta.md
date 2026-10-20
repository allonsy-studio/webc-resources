---
"@allons-y/webc-studio": minor
---

First beta: the Allons-y Studio theme for Norn sites, built on `@allons-y/webc-patterns`.

- The studio plugin: add it in place of the Norn plugin, with the same options. It adds the Norn plugin with the studio components, fills the page frame's hooks with `studio-head`, `studio-bar`, `studio-cta`, and `studio-credit`, embeds the brand tokens, sets the theme color and locale, and copies the fonts to `assets/fonts`.
- The brand, `css/tokens.css`: custom properties in the `norn.studio` layer for the mono face, the card accents, the code sample dots, the header stripe, and the footer name.
- Components: `studio-head` (the font preload and the self-hosted `@font-face` rules), and the locked `studio-bar`, `studio-cta`, and `studio-credit`.
- Helpers: `studioProps`, the studio's link set as layout props from the site facts and `project.json`; `studioEnabled`, which reads the `oss-docs` opt-out; `host`, `policies`, `components`, `tokens`, and `fonts`. The data builders and the page layouts are the patterns package's.
