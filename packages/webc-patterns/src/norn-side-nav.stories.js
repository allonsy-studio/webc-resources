/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-side-nav",
	component: "norn-side-nav",
	argTypes: {
		items: {
			description: "The pages, in order.",
			type: { name: "array", required: true },
			table: { type: { summary: "{ href: string, title: string, icon?: string, children?: { href: string, title: string }[] }[]" } },
		},
		label: { description: 'The landmark name, read but not shown, as one element. Falls back to the site\'s `componentStrings`, then "Pages".' },
		search: { description: "A search field above the list, as one element." },
	},
	parameters: {
		webc: {
			overrides: {
				"items type": "Required: without it the list is empty, and no setup function throws.",
				"items table.type": "The items' shape: the code reads their fields, not their types.",
			},
		},
		docs: {
			description: {
				component: "Sidebar navigation from a list of pages. Marks the current page with `aria-current=\"page\"`, and a page holding it with `aria-current=\"true\"`. An item may carry a `norn-icon` name and child pages, which list under it, indented. The current page takes a tint of the accent and the accent as its text color, and the pointer takes a lighter layer. In a sticky `norn-sidebar-layout` column only the list scrolls, so a search field in the `search` slot stays put.",
			},
		},
	},
};

export const Default = {
	args: {
		items: [
			{ href: "/frames/patterns/norn-side-nav/default/", title: "Getting started" },
			{ href: "#usage", title: "Usage" },
			{ href: "#reference", title: "Reference" },
		],
	},
};
