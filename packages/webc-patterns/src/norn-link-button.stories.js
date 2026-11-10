/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-link-button",
	component: "norn-link-button",
	argTypes: {
		href: { description: "The link's URL.", type: { name: "string", required: true } },
		variant: { description: "`primary`, a filled accent; `secondary`, a 1px outline; or `quiet`, text with no border." },
		tone: { description: "`accent`, the accent text color; or `current`, the surrounding text color, for a secondary or quiet button inside a colored container such as `norn-notice`. A primary button keeps its fill and text." },
		"icon-only": { description: "Show only the icon, in a square at the control height. The default slot holds the `norn-icon`, and the `label` slot the link's name, read but not shown." },
		default: { description: "The link text, which may hold a `norn-icon`." },
		label: { description: 'The link\'s name for `@icon-only`, such as `<span slot="label">Subscribe by RSS</span>`.' },
	},
	parameters: {
		webc: {
			overrides: {
				"href type": "Required: a link needs a URL, and no setup function throws without one.",
			},
		},
		docs: {
			description: {
				component: "A link styled as a button, for a call to action. It navigates, so it stays a link: use a `<button>` for an action on the page. The default slot is the link text, and may hold a `norn-icon`. A hover and a press take a layer of the text color over the background, and the text is never underlined.",
			},
		},
	},
};

export const Default = { args: { href: "#start", default: "Get started" } };

export const Icon = { name: "With an icon", args: { href: "#next", default: 'Next step <norn-icon @name="arrow-end"></norn-icon>' } };

export const Secondary = { name: "Secondary", args: { href: "#sponsor", variant: "secondary", default: "Sponsor" } };

export const IconOnly = { name: "Icon only", args: { href: "#feed", "icon-only": true, default: '<norn-icon @name="arrow-end"></norn-icon>', label: "Next step" } };
