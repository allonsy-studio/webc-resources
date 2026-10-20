# Component preview

A Storybook-style preview of the components and layouts in the three packages, built with Eleventy and WebC. The published preview is at <https://allonsy-studio.github.io/webc-resources/>, deployed from `main`.

The preview reads each package's components and layouts from their JSDoc and joins them to their stories. While the packages hold no components, the components page says so.

## Run it

```sh
yarn docs:start        # serve at http://localhost:8080, rebuilt as the packages or the preview change
yarn docs:build        # build into preview/_site
```

Set `PATH_PREFIX=/webc-resources/` to build for a site served from a subpath. The `Pages` workflow does, to publish the preview on GitHub Pages at that path. Link and asset URLs in the preview's layouts and components stay root-relative (`/assets/`); the `HtmlBasePlugin` adds the prefix to them in the output. A URL built in a script or passed as a prop needs Eleventy's `url` filter.

## What a component page has

| Part | Comes from |
| --- | --- |
| Description, props, slots, custom properties | The JSDoc in the `<!--- … --->` comment at the top of the component file, read at build time |
| Examples | The stories in `content/stories/<package>/<component>/`, each rendered in its own frame |
| Source | The story file |
| Canvas controls | The `preview-canvas` component, below |

The navigation and the components page group the components by the `@category` each declares in its JSDoc.

### Canvas controls

| Control | Does |
| --- | --- |
| Color scheme | Light, System, and Dark radio buttons. System leaves the frame to the reader's setting. |
| Width | Fill, phone (320px), tablet (768px), and desktop (1024px) radio buttons |
| Check accessibility | Loads axe-core into the frame and runs the WCAG 2.0, 2.1, and 2.2 A and AA rules and axe's best practices on the frame as it is now. It lists each violation with its rule, impact, and how many elements fail, or says there are none. |

## Add a story

Add a `.webc` or `.md` file to `content/stories/<package>/<component>/`. Its front matter takes a `title` and an `order`, and a story can set `bleed: true` for no padding or `ownH1: true` when the component renders the page's h1. The file's body is the story: write the component the way a page would.

A component or layout with no story fails `yarn test`. A page can only use a component the build registers: add the packages' components to the WebC plugin in `eleventy.config.js` when the first story needs one.

## Layout

| Path | Holds |
| --- | --- |
| `eleventy.config.js` | The WebC plugin for the preview's own components, the path prefix, the passthrough copies, and the watch targets |
| `lib/catalog.js` | The JSDoc parser and the component and story catalog |
| `lib/browser.js` | The browser test's helpers: a static server, a launcher, and the axe audit |
| `_data/` | The catalog |
| `_includes/` | The preview's own components: `preview-nav` and `preview-canvas` |
| `_layouts/` | The page shell and the story frame |
| `content/` | The components page, `stories/`, and `assets/` (the preview's CSS, brand, and font) |
| `build.test.js` | Builds the preview and audits its pages |
