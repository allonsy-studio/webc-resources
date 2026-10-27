/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Template/norn-landing",
	component: "norn-landing",
	argTypes: {
		lede: { description: "The hero paragraph. Falls back to the description.", control: "text", table: { category: "props", type: { summary: "string" } } },
		repo: { description: "The repository's URL.", control: "text", table: { category: "props", type: { summary: "string" } } },
		license: { description: "The license name, for the hero's facts.", control: "text", table: { category: "props", type: { summary: "string" } } },
		node: { description: "The lowest Node version, such as `24+`.", control: "text", table: { category: "props", type: { summary: "string" } } },
		install: { description: "The install command.", control: "text", table: { category: "props", type: { summary: "string" } } },
		usage: { description: "One sample for the hero. With it, the install command gets its own section.", control: "object", table: { category: "props", type: { summary: "{ language: string, code: string, caption?: string }" } } },
		features: { description: "Feature cards.", control: "object", table: { category: "props", type: { summary: "{ title: string, body: string, href?: string }[]" } } },
		packages: { description: "Package cards, titles in the mono face.", control: "object", table: { category: "props", type: { summary: "{ name: string, description: string, href?: string }[]" } } },
	},
	parameters: {
		docs: {
			description: {
				component: 'A project\'s landing page: the hero with the usage or install sample, then the install, features, and packages sections. Extends `norn-base`. The page body follows the sections, in a section of its own, in `norn-rich-text`. Markdown is compiled once, as on `norn-docs`, and a page with no body renders no section. Samples are `norn-code-block`s: highlighted with `@allons-y/webc-code-sample`, and plain `<pre><code>` without it. Its texts ("Get started", "View on GitHub", "Free & open source", "License: {license}", "Node {node}", and the section headings) come from `componentStrings` under `norn-landing`, then English.',
			},
		},
	},
};
