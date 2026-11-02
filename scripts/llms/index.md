# Norn (webc-resources)

> WebC components, Eleventy page layouts, and an Eleventy plugin for docs, landing, and workspace sites, in three npm packages. This file is for AI agents. It says which package to use and where the full instructions are.

Read the package's `llms.txt` before you write or change code that uses it. It holds the rules, the data shapes, and a reference of every component's props, slots, and tokens, generated from the sources. When a package is installed, the same file is at `node_modules/@allons-y/<package>/llms.txt`.

## Which package

- Building a docs, landing, or monorepo site on Eleventy and WebC: `@allons-y/webc-patterns`. This is the one to start with.
- Highlighted code samples: `@allons-y/webc-code-sample`, an optional peer of patterns.
- An Allons-y Studio open source site: `@allons-y/webc-oss-site`, in place of the Norn plugin.
- Changing this repository (a component, a layout, the tokens, the preview): read `AGENTS.md`.

## Rules that apply everywhere

- Call components as custom tags with `@` props, and put content and every visitor-facing string in slots, not attributes.
- Style through the global `--norn-*` tokens, a component's props, or CSS against its tag in the project's own stylesheet. Components have no custom properties of their own.
- Use one item shape in all data: `href`, `title`, `description`.
- Do not register `@11ty/eleventy-plugin-webc` yourself. The Norn plugin does.
- Do not invent tags, props, or tokens. If it is not in the reference, it does not exist.
