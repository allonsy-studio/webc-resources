/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-tag",
	component: "norn-tag",
	argTypes: {
		href: { description: "Where the tag links, such as the tag's page. With it the tag is a link with the edge of a control; without it, a static label." },
		color: { description: "A tint from a shared color token: `accent`, or a status color. Without it the tint is the text color. The label stays in the text color, so the word carries the meaning." },
		current: { description: 'Mark the tag of the page the visitor is on, with `aria-current="true"`. Only on a tag with `href`.' },
		tag: { description: "The key `norn-tag-filter` matches against each item's `data-tags`, such as `css`. Only on a tag with `href`." },
		default: { description: "The label, in sentence case." },
	},
	parameters: {
		docs: {
			description: {
				component: "A topic label. With `@href` it is a link: a hairline edge at control contrast, a state layer and an underline on hover and focus, and a heavier edge and label when it is the current page or an active filter. Without `@href` it is a static tint with no edge, and not focusable. Inside `norn-tag-filter`, a tag with `@tag` becomes a toggle.",
			},
		},
	},
};

export const Default = {
	args: { href: "#css", default: "CSS" },
};

export const Static = {
	name: "Static",
	args: { color: "accent", default: "Featured" },
};
