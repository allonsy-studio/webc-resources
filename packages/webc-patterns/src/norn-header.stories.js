/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-header",
	component: "norn-header",
	argTypes: {
		"logo-height": { description: "The logo's height, as a CSS length. Falls back to 2rem." },
		brand: { description: "The brand link, as one element." },
		label: { description: 'The navigation landmark name, read but not shown, as one element. Falls back to the site\'s `componentStrings`, then "Primary".' },
		summary: { description: 'The text of the control that opens the links on a narrow header, as one element. Falls back to the site\'s `componentStrings`, then "Menu".' },
		default: { description: "The navigation links." },
	},
	parameters: {
		docs: {
			description: {
				component:
					'Site header: the brand link, then the primary navigation. Pass the brand as one element in the `brand` slot, such as `<a slot="brand" rel="home" href="/">Name</a>`, holding text or an `<img>` logo with alt text. A logo is 2rem tall, or the height `logo-height` gives. The default slot holds the navigation links, each an `<a>` that may start with a `norn-icon`. Without links there is no navigation landmark. The links are quiet until the pointer or focus is on one, and the one marked `aria-current` has the text color and a 2px accent line. When the header is narrower than 40rem, the links fold into a closed `<details>` at the end of the brand\'s row, under the `summary` text, and the open menu lists them full width. A browser without `::details-content` always shows the control.',
			},
		},
	},
};
