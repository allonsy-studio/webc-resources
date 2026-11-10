/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-eyebrow",
	component: "norn-eyebrow",
	argTypes: {
		default: { description: "One short label, such as a category or a status, in sentence case. No dates and no separators." },
	},
	parameters: {
		docs: {
			description: {
				component: "The small kicker above a title: one label in muted text, set uppercase by CSS with a little tracking. Write the label in sentence case, so a screen reader reads a word and not letters. Put it before the heading it introduces; a date goes on its own line after the heading.",
			},
		},
	},
};

export const Default = {
	args: { default: "Design systems" },
};
