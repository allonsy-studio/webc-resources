# @allons-y/webc-code-sample

Part of [Norn](https://github.com/allonsy-studio/webc-resources#readme). `norn-code-block` WebC component with build-time syntax highlighting. Shiki runs at build; the browser receives token ranges for the CSS Custom Highlight API and a copy button, with no highlighter shipped.

See it in the [component preview](https://allonsy-studio.github.io/webc-resources/).

Using an AI coding agent? Point it at [`llms.txt`](llms.txt): the rules for calling and styling the components, and a reference of every prop, slot, and token.

## Status

Beta. Versions are `0.1.0-beta.N` until 1.0.

## Install

```sh
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-webc @allons-y/webc-patterns @allons-y/webc-code-sample
```

Node 22 or later. Evergreen browsers from about 2024. Features newer than that, such as the CSS Custom Highlight API, degrade gracefully: the code stays readable plain text.

The package registers nothing itself. It is an optional peer dependency of `@allons-y/webc-patterns`: with it installed, the Norn plugin registers `norn-code-block`, the `nornTokenRanges` helper, and the Markdown add-on, and the Norn layouts show their samples with it. The copy button is the patterns package's `norn-copy-button`.

## Usage

Install it beside the patterns package and add the Norn plugin (or a theme that adds it, such as `@allons-y/webc-oss-site`). There is nothing else to register:

```js
import norn from "@allons-y/webc-patterns/plugin";

export default function (config) {
	config.addPlugin(norn, { props: (data) => ({ title: data.title, name: "My project" }) });

	return { markdownTemplateEngine: false };
}
```

Without the Norn plugin, add `codeBlock` to the project's own WebC `components` list beside `patterns()` from `@allons-y/webc-patterns`, and register `tokenRanges` as `nornTokenRanges`. Without `patterns()` in the list, `norn-copy-button` is an unknown tag and the code blocks render with no copy button and no error.

Call the component from a WebC page. Props take the `@` prefix:

```html
<norn-code-block @language="js" @caption="example.js" @code="const answer = 42;"></norn-code-block>
```

### Markdown

The Norn plugin adds the Markdown add-on for fenced code. Without the plugin, amend the library yourself:

```js
import { highlightFences } from "@allons-y/webc-code-sample/markdown";

config.amendLibrary("md", highlightFences);
```

Each fence renders as the `<norn-code-block>` an author would write, with the fence's first word as `@language`. The add-on fills no slots, so the labels and button texts come from the component's fallbacks, as in Translating below. The fence's tag is compiled by WebC, so the page's layout renders the Markdown content with `@html="content"`. Every Norn layout does, and `norn-base` does for a Markdown page that uses it directly.

### Translating

Every string a visitor sees or hears is content in the page, in a named slot, hidden until the script uses it: slot `label` names the code when there is no caption, `copy-label` names the copy button (`{name}` stands in for the code's name, filled in by the script), and `copy`, `copied`, and `failed` are the button's texts:

```html
<norn-code-block @language="sh" @code="npm install">
	<span slot="label">Commande d'installation</span>
	<span slot="copy-label">Copier la {name}</span>
	<span slot="copy">Copier</span>
</norn-code-block>
```

An empty slot falls back to the site's strings from the patterns package's `componentStrings`, under `norn-code-block` (`label`, with `{language}` for the language, and `copy-label`) and `norn-copy-button` (`copy`, `copied`, `failed`), then to English. That covers Markdown fences too: `highlightFences` writes no slots of its own.

### Layout requirements

The Norn layouts meet these. A layout of the project's own:

- Links the page's bundles from the layout head, with `webc:keep` on both tags. WebC removes `<link>` and `<script src>` without it. `norn-head` does this.

  ```html
  <link rel="stylesheet" :href="getBundleFileUrl('css')" webc:keep />
  <script :src="getBundleFileUrl('js')" defer webc:keep></script>
  ```

- Sets `markdownTemplateEngine: false`, or the default Liquid pass rewrites `{{ }}` inside fences.
- Drops the `href=""` and `src=""` tags a page with no bundles is left with: `webc:if` can't guard them, because the URL resolves after render. The Norn plugin registers `dropEmptyBundleTags` from the patterns package as a transform for this.

### Without JavaScript

The code stays readable plain text, and is not a tab stop: the script makes it a named, focusable region only while it scrolls sideways. The highlight colors need the CSS Custom Highlight API and a script. The copy button is an icon over the top end corner of the code, which names itself when the pointer or focus is on it, and needs a script and the Clipboard API, which browsers expose only on secure origins (HTTPS or localhost): elsewhere it stays hidden. The code always reads left to right, in a right-to-left page too. The script registers `norn-code-block` as a custom element, so a sample added to the page later is enhanced too.

### Customizing

`@chrome="terminal"` frames the code with a header bar for the caption:

```html
<norn-code-block @chrome="terminal" @language="sh" @caption="Terminal" @code="npm install"></norn-code-block>
```

The sample reads shared tokens only, each falling back to its default compiled into the component, so it keeps its look with no stylesheet beside it. Set them in a project `tokens.css`:

| Token | Controls |
| --- | --- |
| `--norn-surface-code`, `--norn-text-base` | Surface and text colors |
| `--norn-ui-border-radius`, `--norn-space-m` | Corner radius and inner spacing |
| `--norn-font-mono` | Font stack |
| `--norn-code-comment`, `--norn-code-string`, `--norn-code-keyword`, `--norn-code-function`, `--norn-code-number`, `--norn-code-flag` | Syntax colors |

## Exports

| Export | Purpose |
| --- | --- |
| `codeBlock` | Absolute path to `components/norn-code-block.webc` |
| `tokenRanges(code, language)` | Shiki tokens as the compact JSON that `data-tokens` carries, or undefined with no tokens: `[groups, numbers]`, the group names once each, then three whole numbers per range, the group's index in `groups`, the gap from the end of the range before (from 0 for the first), and the length: `[["keyword","string"],[0,0,5,1,3,4]]` is `keyword` from 0 to 5 and `string` from 8 to 12. The ranges are character offsets in order, and none overlaps the next. The groups are `comment`, `string`, `keyword`, `function`, `number`, `flag`, and `punctuation`. For `sh`, `bash`, `shell`, and `shell-session`, the command is a `function`, its subcommand a `keyword`, a flag a `flag`, and an argument a `string`. The plugin registers it as `nornTokenRanges` |
| `decodeRanges(value)` | Reads a `tokenRanges` string back into `[group, start, end][]` character offsets. Undefined reads as `[]`; any other value that is not the compact form throws a `TypeError` that says what is wrong |
| `loadLanguages(...languages)` | Adds Shiki language registrations beyond the defaults (`bash`, `css`, `diff`, `html`, `javascript`, `json`, `markdown`, `typescript`, `yaml`), such as `import rust from "@shikijs/langs/rust"`. Call it once, before the build highlights code |

`@allons-y/webc-code-sample/markdown` exports `highlightFences(md)`, a markdown-it amend that renders fenced code as `<norn-code-block>`.

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
