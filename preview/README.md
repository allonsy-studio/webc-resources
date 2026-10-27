# Component preview

A Storybook-style preview of every Norn component and layout in the three packages, built with Eleventy and WebC. It uses the packages the way a project does, through the Norn plugin, so what it shows is what a consumer's build produces. The layouts render without the OSS site theme; the OSS components have stories of their own. The published preview is at <https://allonsy-studio.github.io/webc-resources/>, deployed from `main`. Each pull request from this repository gets its own preview under `preview/<number>/`, linked in a comment on the pull request and removed when it closes.

## Run it

```sh
yarn docs:start        # compile the components, then serve at http://localhost:8080, rebuilt as `src/` (the CSF files included) or `tokens.json` change
yarn docs:build        # build into preview/_site
```

Set `PATH_PREFIX=/webc-resources/` to build for a site served from a subpath. The `Pages` workflow does, to publish the preview on GitHub Pages at that path. Link and asset URLs in the preview's layouts and components stay root-relative (`/assets/`); the `HtmlBasePlugin` adds the prefix to them in the output. A URL built in a script or passed as a prop needs Eleventy's `url` filter.

## What a component page has

| Part | Comes from |
| --- | --- |
| Description, props, slots, custom properties | The component's CSF file, `src/<name>.stories.js` in its package, read at build time. A component that has not moved to CSF yet is read from the JSDoc in the `<!--- … --->` comment at the top of its file |
| Examples | The CSF stories, in export order, then the story pages in `content/stories/<package>/<component>/`, then the matrix, each rendered in its own frame |
| Source | The markup the default renderer writes from a CSF story's args, or the story page's file, shown with `norn-code-block` |
| Canvas controls | The `preview-canvas` component, below |

Head components (`norn-head`, `oss-head`) have no canvas, since every frame renders them. A layout's story is a whole page on that layout, in a frame of its own.

The navigation and the index group the components by category: the first part of the CSF title (`Container/norn-card`), or the `@category` in the JSDoc of a component without a CSF file. The categories are layout, landmark, container, component, template, and document. The OSS site package is the exception: its components keep their category, but are listed together, by name, in a last group, "OSS site".

On a phone (48rem and narrower) the navigation is one closed disclosure, "Components" with the count, above the page. On a wide screen the groups are the sidebar, and the disclosure's bar is hidden where the browser supports `::details-content`. A touch screen gets 44px targets for the navigation and the canvas controls.

### Canvas controls

| Control | Does |
| --- | --- |
| Color scheme | Three icon buttons, a sun for light, a half-filled circle for the system setting, and a moon for dark. They are radio buttons, so one is on at a time. |
| Width | Device icons for fill, phone (320px), tablet (768px), and desktop (1024px), also radio buttons. Hidden on a phone (40rem and narrower), where the frame always fills its box |
| Check accessibility | Loads axe-core into the frame and runs the WCAG 2.0, 2.1, and 2.2 A and AA rules and axe's best practices on the frame as it is now: the scheme, the width, and any overrides. It lists each violation with its rule, impact, and how many elements fail, or says there are none. |
| Custom properties | A table of the component's properties: name, type, default, and an override field in the same row. On a narrow screen each property stacks as a block |

## Try the tokens

The Foundations page lists every shared `--norn-` token in `tokens.json` with its group, default, comment, a preview, and an Override column. A space is drawn as a rule as wide as the token with a mark at each end.

- A color token has a Light picker and a Dark picker, both `type="color"`, that start at what the token resolves to in each scheme, and a Reset. Setting either saves `light-dark(light, dark)`, so the other keeps its value. Every other token has a text field that takes any CSS value, such as `1.5rem`.
- A value is saved in `localStorage` (key `norn-preview-tokens`) and applied to every preview page, frames and the preview's own pages alike, before the page first paints.
- Other open tabs update when a value changes, through the `storage` event.
- A bar under the header shows how many overrides apply, with a Reset.
- A field in a canvas's Custom properties panel wins over a saved override, and clearing it hands the value back.
- With storage blocked, an override lasts for the page it was set on.

`assets/tokens.js` does the loading. It sets values through the CSSOM, so a stored value can't break out of its rule.

The component frames define no token, so they show the defaults compiled into each component. The preview's own pages read the tokens in their CSS, so they load `assets/styles/tokens.css`, a `:root` rule the build writes from `tokens.json` (`content/tokens.11ty.js`).

## Add a story

A single instance of a component, with props and slots, is a CSF story: a named export in the component's `.stories.js` with its `args`.

```js
export const Linked = { name: "Linked heading", args: { default: '<h3><a href="https://example.com/">Linked card</a></h3>' } };
```

`lib/render-story.js` writes it as WebC: a string prop as `@name="…"`, `true` as a bare `@name`, any other value as a `:@name` expression, each named slot as a `<template slot="name" webc:nokeep>`, the `default` slot as the children, and custom properties as a `style`. One virtual template per package builds the frames at `/frames/<package>/<component>/<kebab export name>/`, with the layout and data a story page there has. `parameters.webc.hiddenH2` and `parameters.webc.ownH1` set the frame data a page sets in its front matter. A component with `options` or boolean props also gets `/frames/<package>/<component>/matrix/`: each value of one prop at a time, over the meta's and the `Default` story's args, each cell labeled `prop = value`.

Anything more, such as a composition, Markdown, or a whole page on a layout, is a story page. Add a `.webc` or `.md` file to `content/stories/<package>/<component>/`. Its front matter takes a `title` and an `order`, and a story can set `bleed: true` for no padding, `ownH1: true` when the component renders the page's h1, or `hiddenH2: true` for a component that starts at a third-level heading, which adds a hidden h2 after the frame's hidden h1. The file's body is the story: write the component the way a page would. The page reads its component's CSF file as `$data.csf`: `title`, `component`, the baseline `args`, the `argTypes` by category (`props`, `slots`, `cssprops`), and the `stories` with their resolved args. Loop over a prop's options from there instead of listing them, as the `norn-callout` Variants page does.

```webc
---
title: Linked heading
order: 2
---
<h2>Cards</h2>
<norn-card>
	<h3><a href="https://example.com/">Linked card</a></h3>
	<p>Put a link in the heading to link the card.</p>
</norn-card>
```

A new component or layout with no story fails `yarn test`. For a layout, the story's front matter names it (`layout: norn-landing.webc`), and the page's props come from the sample `site` and `project` data in `_data/`, mapped in `eleventy.config.js`.

## Layout

| Path | Holds |
| --- | --- |
| `eleventy.config.js` | The Norn plugin with the props mapping the layout stories use, the compile step, the virtual templates for the CSF frames, and the watch targets |
| `lib/catalog.js` | The CSF reader, the JSDoc parser for components that have no CSF file yet, and the component and story catalog |
| `lib/render-story.js` | The default renderer, which writes a CSF story's args as WebC, and the matrix |
| `_data/` | The catalog, the foundations tokens, and the sample site, project, and workspace data |
| `_includes/` | The preview's own components: `preview-nav`, `preview-canvas`, `preview-props`, `preview-tokens`, and `preview-overrides` |
| `_layouts/` | The page shell, and the plain and OSS story frames: layouts of the preview's own, which call `norn-head` and link the reset, base, and print styles |
| `content/` | The index, foundations, and component pages, `stories/`, and `assets/` (the token loader and the preview CSS) |
| `build.test.js` | Builds the preview and audits its pages |
