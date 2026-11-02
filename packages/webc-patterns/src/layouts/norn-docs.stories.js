/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Template/norn-docs",
	component: "norn-docs",
	argTypes: {
		docs: { description: "The docs pages, in order. `icon` names a sidebar `norn-icon`.", table: { type: { summary: "{ url: string, title: string, icon?: string }[]" } } },
		prev: { description: "Falls back to the page before this one in `docs`, by `nornAdjacent`.", table: { type: { summary: "{ url: string, title: string }" } } },
		next: { description: "Falls back to the page after this one in `docs`.", table: { type: { summary: "{ url: string, title: string }" } } },
		search: {
			description: "Pagefind's script (falls back to `/pagefind/pagefind.js`) and the host the plain form searches (falls back to the host of `url`; a `url` with a scheme that does not parse fails the build). `false` leaves the search out.",
			table: { type: { summary: "{ bundle?: string, site?: string } | false" } },
		},
		default: { description: "The page body, in `norn-rich-text`. Its anchored headings make the contents." },
	},
	parameters: {
		webc: {
			overrides: {
				"docs table.type": "Passed on to a child component's prop and a helper, so the layout's code does not say it is a list, or its items' shape.",
				"prev table.type": "Passed on as a child component's prop, so the layout's code does not say its shape.",
				"next table.type": "Passed on as a child component's prop, so the layout's code does not say its shape.",
				"search table.type": "The object's shape and the `false` value: the code reads its fields, not their types.",
			},
		},
		docs: {
			description: {
				component:
					'A docs page: the sticky docs sidebar with site search above its list, the page title, its contents when it has two or more sections, the body in `norn-rich-text`, and the pager. Extends `norn-base`. When the page is 60rem wide or more, the contents are a sticky column at the end of the body. Narrower, they fold under their title, and the sidebar folds into a closed `<details>` under the sidebar\'s name. The search is live from a Pagefind index at `pagefind/`, or a web search of the site\'s host without one. Only the page body is indexed. The contents list comes from `nornHeadings` over the body: `headingAnchors`, which the plugin adds to Markdown, writes the anchored headings. With fewer than two, the layout leaves `norn-toc` out, so the page ships none of its CSS or JS. The sidebar\'s name ("Documentation") and the search label ("Search the docs") come from `componentStrings` under `norn-docs`, then English.',
			},
		},
	},
};
