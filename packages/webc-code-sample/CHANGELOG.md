# @allons-y/webc-code-sample

## 0.1.0-beta.5

### Minor Changes

-   5a503d2: Adds the `--norn-code-text` and `--norn-code-punctuation` tokens. `norn-code-block` reads them for plain code text and punctuation, and they follow `--norn-text-base` and `--norn-text-muted` until a project sets them.

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

-   43eb7d5: First beta: `norn-code-block`, a WebC code sample highlighted at build time. Shiki runs during the build, and the browser gets token ranges for the CSS Custom Highlight API and a compact `norn-copy-button` over the code's top end corner, with no highlighter shipped. The ranges travel in `data-tokens` as a group table and small integer triples. The code has no border. `@chrome="terminal"` frames the code with a flat header bar for the caption. Its names and copy button texts are named slots, falling back to `componentStrings`, then English, and the code is a named tab stop only while it scrolls. It is an optional peer of `@allons-y/webc-patterns`: installed, the Norn plugin registers the component, `tokenRanges` as `nornTokenRanges`, and the Markdown add-on, and the Norn layouts show their samples with it. Shell samples color the command, its subcommand, its flags (`--norn-code-flag`), and its arguments apart. Theme it with the shared tokens, such as `--norn-code-keyword`, set in a project `tokens.css`. Exports `codeBlock`, `tokenRanges`, `decodeRanges`, which reads the compact form back into ranges, and `loadLanguages`. The Markdown add-on is `@allons-y/webc-code-sample/markdown`: `highlightFences` renders fenced code as the `norn-code-block` an author would write, with no strings of its own.
