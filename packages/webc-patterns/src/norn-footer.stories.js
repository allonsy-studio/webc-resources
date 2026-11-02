/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-footer",
	component: "norn-footer",
	argTypes: {
		width: { description: "The content width, as a CSS length. Falls back to --norn-layout-width." },
		"lead-width": { description: "The widest the lead column gets on a wide footer, as a CSS length. Falls back to 25rem." },
		default: { description: "The columns." },
		colophon: { description: "Full-width content below the columns, as one element." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"Site footer: a row of columns, and a colophon below them. The default slot holds the columns: a lead `<div>` first (the name in a `<p><strong>`, a tagline, the license), then the links, then anything else, such as a credit. Put the links in one `<nav aria-labelledby=\"…\">`, pointing at a hidden name: a `<p><strong>` heading and a `<ul>`, or for several groups a `<div>` each holding its heading and list. The groups sit side by side and wrap. When the footer is 60rem or wider, the lead column takes up to 25rem, or the width `lead-width` gives, and the others size to their content; narrower, the columns wrap.",
			},
		},
	},
};
