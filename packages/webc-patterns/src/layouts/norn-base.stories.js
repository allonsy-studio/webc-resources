/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Template/norn-base",
	component: "norn-base",
	argTypes: {
		lang: { description: "The page language. Falls back to `page.lang`, then `en`." },
		dir: { description: "The text direction, set on `<html>`. Without it, `rtl` for a right-to-left language (`ar`, `fa`, `he`, `ur`, `ps`, `yi`, `dv`, `ckb`, `sd`, `ug`, matched on the primary subtag of `lang`), else `ltr`." },
		title: { description: "The page title. The document title is the title and the name; a page without one shows the name and the tagline." },
		name: { description: "The site name: the brand link, the footer lead, `og:site_name`." },
		tagline: { description: "A short line after the name." },
		description: { description: "The page description: the meta description and `og:description`." },
		url: { description: "The canonical URL." },
		ogTitle: { description: "Falls back to the document title." },
		ogImage: {
			description: "The share image, or its URL: `og:image`, `og:image:alt`, and `twitter:card` (`summary_large_image`). A relative `src` resolves against `url`, which must then be absolute: with no absolute `url`, the build logs a `norn-head:` warning and `og:image` and `og:image:alt` are left out. Without an image, no image tag renders. Either way the card is `summary`.",
			table: { type: { summary: "{ src: string, alt?: string }" } },
		},
		locale: { description: "`og:locale`, such as `en_US`." },
		themeColor: { description: "One color for both schemes. Without it, the page surface in each scheme." },
		themeToggle: { description: "Apply the scheme a `norn-theme-toggle` saved, before the first paint." },
		icon: { description: "The favicon, or its URL. Without it the page links an empty icon, so browsers skip `/favicon.ico`.", table: { type: { summary: "{ href: string, type?: string }" } } },
		touchIcon: { description: "A 180px PNG for home screens." },
		logo: { description: "The brand image, or its URL, in place of the name. The brand link renders only with a logo or a name.", table: { type: { summary: "{ src: string, alt?: string }" } } },
		nav: { description: "The header links. `icon` names a `norn-icon`.", table: { type: { summary: "{ url: string, title: string, icon?: string }[]" } } },
		footer: {
			description: "The footer: the lead column (`name` falls back to the site name, `text` to the tagline), its badges and license, one navigation of grouped links, and a closing line.",
			table: { type: { summary: "{ name?: string, text?: string, license?: { name: string, url: string }, badges?: { href: string, src: string, alt: string, width?: number, height?: number }[], groups?: { heading: string, links: { url: string, title: string }[] }[], colophon?: string }" } },
		},
		default: { description: "The page content, in `main`, before the `cta` hook." },
	},
	parameters: {
		webc: {
			overrides: {
				"ogImage table.type": "The object's shape: the code reads its fields, not their types.",
				"icon table.type": "The object's shape: the code reads its fields, not their types.",
				"logo table.type": "The object's shape: the code reads its fields, not their types.",
				"nav table.type": "The items' shape: the code reads their fields, not their types.",
				"footer table.type": "The object's shape: the code reads its fields, not their types.",
			},
		},
		docs: {
			description: {
				component:
					'The page frame every Norn layout extends: the head, the skip link, `norn-header`, `main`, and `norn-footer`, filled from props. The Norn plugin ships it as an Eleventy layout; use it as `layout: norn-base.webc` for a WebC page, or extend it from a layout of the project\'s own. Markdown content is compiled once, so the components the Markdown add-ons write render, also through a Nunjucks or Liquid layout of the project\'s or a layout alias. Content that is already compiled is inserted as it is, because compiling it again would render its kept component tags twice: a WebC page, a `templateEngineOverride` with `webc`, a `{% renderTemplate "webc" %}` block, a page on a WebC layout of the project\'s own, and a page on a shipped layout, which sets `nornCompiled: true`. The `nornCompiles` helper decides, from `page.templateSyntax`. A Nunjucks, Liquid, or HTML page renders components through `{% renderTemplate "webc" %}`. A WebC layout of the project\'s own deeper in the chain that compiles the content sets `nornCompiled: true` in its front matter. Props are `$data.norn`: the plugin\'s `props` mapping, or the same-named page data. Every list defaults to `[]`. The head calls `norn-head`, which declares the cascade layer order first, then embeds the base and print styles: the plugin fills the two style blocks below from `css/base.css` and `css/print.css`. A copy of this file pastes their text in. A `<section>` directly in `main` is a centered column at `--norn-layout-width` with block padding and a gap, and its `h2` takes the section heading size. The `id` on the section is the anchor. The rule is in the `norn.layout` layer under `:where(main)`, so any rule of a project overrides it, and a section anywhere else is left alone. A section is not a landmark: do not name it. Four hooks take markup from `fillHooks`: `head` at the end of the head, `banner` before the header, `cta` at the end of `main`, and `credit` as the footer\'s last column. The footer\'s texts ("Licensed under {license}", the navigation\'s name "Footer") come from `componentStrings` under `norn-base`, then English.',
			},
		},
	},
};
