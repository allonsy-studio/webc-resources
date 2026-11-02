/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Template/norn-workspaces-home",
	component: "norn-workspaces-home",
	argTypes: {
		lede: { description: "The hero paragraph. Falls back to the description." },
		install: { description: "The install command.", table: { type: { summary: "string" } } },
		repo: { description: "The repository's URL.", table: { type: { summary: "string" } } },
		workspaces: { description: "The workspaces, each with its page.", table: { type: { summary: "{ name: string, description?: string, url: string }[]" } } },
		default: { description: "The page body, after the sections: Markdown or WebC, compiled once. A page with no body renders no section." },
	},
	parameters: {
		webc: {
			overrides: {
				"install table.type": "Passed on as a child component's prop, so the layout's code does not say it is a string.",
				"repo table.type": "Passed on as a child component's prop, so the layout's code does not say it is a string.",
				"workspaces table.type": "The items' shape: the code reads their fields, not their types.",
			},
		},
		docs: {
			description: {
				component:
					'A monorepo\'s home page: the hero with the install sample, then an index of the workspaces, titles in the mono face. Extends `norn-base`. The page body follows the sections, in a section of its own, in `norn-rich-text`. Markdown is compiled once, as on `norn-docs`, and a page with no body renders no section. The install sample is a `norn-code-block`: highlighted with `@allons-y/webc-code-sample`, and a plain `<pre><code>` without it. Its texts ("Get started", "Browse packages", "View on GitHub", "Packages") come from `componentStrings` under `norn-workspaces-home`, then English.',
			},
		},
	},
};
