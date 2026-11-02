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
		lede: { description: "The hero paragraph. Falls back to the description." },
		repo: { description: "The repository's URL.", table: { type: { summary: "string" } } },
		license: { description: "The license name, for the hero's facts." },
		node: { description: "The lowest Node version, such as `24+`." },
		install: { description: "The install command.", table: { type: { summary: "string" } } },
		usage: { description: "One sample for the hero. With it, the install command gets its own section.", table: { type: { summary: "{ language: string, code: string, caption?: string }" } } },
		features: { description: "Feature cards.", table: { type: { summary: "{ title: string, body: string, href?: string }[]" } } },
		packages: { description: "Package cards, titles in the mono face.", table: { type: { summary: "{ title: string, description: string, href?: string }[]" } } },
		default: { description: "The page body, after the sections: Markdown or WebC, compiled once. A page with no body renders no section." },
	},
	parameters: {
		webc: {
			overrides: {
				"repo table.type": "Passed on as a child component's prop, so the layout's code does not say it is a string.",
				"install table.type": "Passed on as a child component's prop, so the layout's code does not say it is a string.",
				"usage table.type": "The object's shape: the code reads its fields, not their types.",
				"features table.type": "The items' shape: the code reads their fields, not their types.",
				"packages table.type": "The items' shape: the code reads their fields, not their types.",
			},
		},
		docs: {
			description: {
				component: 'A project\'s landing page: the hero with the usage or install sample, then the install, features, and packages sections. Extends `norn-base`. The page body follows the sections, in a section of its own, in `norn-rich-text`. Markdown is compiled once, as on `norn-docs`, and a page with no body renders no section. Samples are `norn-code-block`s: highlighted with `@allons-y/webc-code-sample`, and plain `<pre><code>` without it. Its texts ("Get started", "View on GitHub", "Free & open source", "License: {license}", "Node {node}", and the section headings) come from `componentStrings` under `norn-landing`, then English.',
			},
		},
	},
};
