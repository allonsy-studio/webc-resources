/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-breadcrumbs",
	component: "norn-breadcrumbs",
	argTypes: {
		items: { description: "From the top level to the current page.", type: { name: "array", required: true }, table: { type: { summary: "{ href: string, title: string }[]" } } },
		label: { description: 'The landmark name, read but not shown, as one element. Falls back to the site\'s `componentStrings`, then "Breadcrumb".' },
	},
	parameters: {
		webc: {
			overrides: {
				"items type": "Required: without items nothing renders, and no setup function throws.",
				"items table.type": "The items' shape: the code reads their fields, not their types.",
			},
		},
		docs: {
			description: {
				component: 'Where the page sits in the site: a trail of links from the top down, ending at the current page, marked with `aria-current="page"`. Data-driven, so the last item is always the current one. The separators are decorative chevrons that point the reading way, so they mirror in right-to-left text.',
			},
		},
	},
};

export const Default = {
	args: {
		items: [
			{ href: "#home", title: "Home" },
			{ href: "#docs", title: "Docs" },
			{ href: "/frames/patterns/norn-breadcrumbs/default/", title: "Configuration" },
		],
	},
};
