/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-skip-link",
	component: "norn-skip-link",
	argTypes: {
		href: { description: "The target's fragment." },
		label: { description: 'The link text, as one element, such as `<span slot="label">Aller au contenu</span>`. Falls back to the site\'s `componentStrings`, then "Skip to content".' },
	},
	parameters: {
		docs: {
			description: {
				component: 'Link that jumps past the page chrome to the main content. Hidden until it has focus: press Tab from the top of the page to show it. Give the target `tabindex="-1"`, as in `<main id="main" tabindex="-1">`.',
			},
		},
	},
};
