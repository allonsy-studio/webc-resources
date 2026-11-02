/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-heading-anchor",
	component: "norn-heading-anchor",
	// The matrix renders one heading per level, and each needs a slug.
	args: { slug: "section", default: "Section" },
	argTypes: {
		slug: { description: "The heading's id, and the link's fragment." },
		level: { description: "The heading level.", options: [2, 3, 4, 5, 6], table: { defaultValue: { summary: "2" } } },
		default: { description: "The heading text." },
	},
	parameters: {
		webc: {
			overrides: {
				"level options": "The `webc:else` branch renders the h2 for any other value, so the comparisons name 3 to 6 only.",
				"level table.defaultValue": "Only the `webc:else` branch gives the h2, so no expression holds the default.",
			},
		},
		docs: {
			description: {
				component:
					"A heading that links to itself, so a reader can copy a link to the section. The heading text is the link, with a `#` before it. Where the pointer can hover and the page is at least 70rem wide, the `#` hangs in the margin and shows while the heading is hovered or has focus. Elsewhere it stays in line: there is no hover to reveal it, or no room in the margin for it. The default slot is the heading text. `headingAnchors` in `@allons-y/webc-patterns/markdown` writes this component for Markdown headings. The `#` takes --norn-text-muted.",
			},
		},
	},
};
