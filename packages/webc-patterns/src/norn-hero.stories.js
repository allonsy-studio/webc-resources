/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-hero",
	component: "norn-hero",
	// The matrix cells show a lede, so each width has something to hold.
	args: { default: "<p>One or two sentences on why a reader would want it, and what they get in the first minute.</p>" },
	argTypes: {
		default: { description: "The h1, lede, actions, facts, and extras, in that order." },
		width: { description: "Content width: `layout`, --norn-layout-width, or `measure`, the prose line length, --norn-text-measure.", options: ["layout", "measure"], table: { defaultValue: { summary: "layout" } } },
	},
	parameters: {
		webc: {
			overrides: {
				"width options": "Any value but `measure` gives the layout width, so the code names `measure` only.",
				"width table.defaultValue": "The layout width is the conditional's `undefined` branch, so no expression holds the default.",
			},
		},
		docs: {
			description: {
				component:
					"Page intro, in the default slot: an h1, a lede, the actions, the facts, and anything after, such as an install `norn-code-block`. Write the h1 as one or two `<span>`s: the name, then a tagline in the accent color. The actions are a `<nav aria-labelledby=\"…\">`, pointing at a hidden name, holding a `<ul role=\"list\">` of `norn-link-button`s, and the facts a `norn-fact-list` with `@gap=\"l\"`.",
			},
		},
	},
};
