/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Document/norn-head",
	component: "norn-head",
	argTypes: {
		title: { description: "The page title, for `<title>` and `og:title`.", type: { name: "string", required: true } },
		description: { description: "The page description, for the `description` meta and `og:description`." },
		url: { description: "The canonical URL. Checked with `typeof`: a missing `url` prop resolves to Eleventy's `url` filter." },
		"theme-color": { description: "One color for both schemes. Without it, the page surface in each scheme." },
		"og-title": { description: "Falls back to the title." },
		"og-image": { description: "The share image, for `og:image`. Open Graph needs an absolute URL, so a relative one resolves against the canonical `url`. When `url` is not absolute, the build logs a warning, and `og:image` and `og:image:alt` are left out, with a `summary` card. Without an image, no image tag renders." },
		"og-image-alt": { description: "The image's description, for `og:image:alt`. Ignored without `og-image`." },
		"theme-toggle": { description: 'Adds a small inline script that applies the scheme a `norn-theme-toggle` saved, before the first paint. On for `@theme-toggle`, `@theme-toggle="true"`, or `:@theme-toggle="true"`.' },
	},
	parameters: {
		webc: {
			overrides: {
				"title type": "Required: every page needs a `<title>`, and no setup function throws without one.",
			},
		},
		docs: {
			description: {
				component:
					"Head metadata, the cascade layer order, and the page's bundle links. `norn-base` calls it; a layout of the project's own can too. Call it in the head as `<meta webc:is=\"norn-head\" webc:nokeep … />`: a custom tag in the head would close it early. Emits Open Graph tags and `twitter:card`: `summary_large_image` when an image is set, else `summary`. Write extra head tags right after the call: they land after the bundle links. Declares the layer order in an inline style before the bundle links, so it comes first whatever order the page's styles bundle in: `norn.reset, norn.base, norn.layout, norn.components, norn.oss, norn.print`. A project's unlayered CSS beats every layer without `!important`. The base and print styles are files, `css/base.css` and `css/print.css`: `norn-base` embeds them, and a layout of the project's own adds them itself. Register `dropEmptyBundleTags` as a transform so a page without CSS or JS keeps no empty `<link>` or `<script>`; the Norn plugin does.",
			},
		},
	},
};
