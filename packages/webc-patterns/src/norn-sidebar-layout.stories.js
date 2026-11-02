/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Layout/norn-sidebar-layout",
	component: "norn-sidebar-layout",
	argTypes: {
		"nav-width": { description: "The navigation column's width, as a CSS length.", table: { defaultValue: { summary: "14rem" } } },
		gap: { description: "The space between the navigation and the body, a step of --norn-space-*.", table: { defaultValue: { summary: "l" } } },
		columns: { description: "The body's grid columns, as a `grid-template-columns` value, to put something beside the prose. Falls back to one column." },
		nav: { description: "The navigation, as one element." },
		summary: { description: 'The text of the control that opens the navigation on a narrow frame, as one element. Falls back to the site\'s `componentStrings`, then "Menu". A layout passes the navigation\'s own name.' },
		default: { description: "The page body, starting with its h1." },
	},
	parameters: {
		webc: {
			overrides: {
				"nav-width table.defaultValue": "The width is the CSS fallback of the private --_nav, which the markup leaves unset without the prop.",
				"gap table.defaultValue": "The l gap is the CSS rule for no data-gap: the markup sets no attribute for an unset or unknown prop.",
			},
		},
		docs: {
			description: {
				component:
					"A navigation column beside the page body. Layout only: it sets no heading style and no line length. A page that uses it directly styles its own h1 and the body's line length, as `norn-docs` and `norn-workspace` do. Wrap prose in `norn-rich-text`. Pass the navigation as one element in the `nav` slot, such as `<norn-side-nav slot=\"nav\" …>`, and the body, starting with its h1, in the default slot. The navigation stays in view while the page scrolls, and a long list scrolls inside it. When the frame is narrower than 37.5rem the columns stack, and the navigation folds into a closed `<details>` above the body, under the `summary` text. A browser without `::details-content` always shows the fold. Sections and articles inside the body stack with a small gap. The frame is as wide as --norn-layout-width allows. A project sets another width with CSS against the tag, in its own unlayered stylesheet.",
			},
		},
	},
};
