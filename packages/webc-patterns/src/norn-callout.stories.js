/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-callout",
	component: "norn-callout",
	argTypes: {
		variant: { description: "The kind of aside." },
		heading: { description: 'The label over the body, as one element, such as `<span slot="heading">Did you know?</span>`. Falls back to the site\'s `componentStrings` for the variant, then the variant\'s name, such as "Note".' },
		default: { description: "The body." },
	},
	parameters: {
		docs: {
			description: {
				component: "An aside in long-form text, set apart like a pull quote: a short label with an icon over the body, on a quiet raised panel. Use it for a fun fact, a tip, or a point worth a pause. It is not a status message: use `norn-notice` for one. The kinds match GitHub's alerts and differ only in the label's color, its default text, and its icon. `callouts` in `@allons-y/webc-patterns/markdown` writes the same markup for a Markdown `> [!NOTE]` blockquote. Its role is `note`: it is not a landmark.",
			},
		},
	},
};

export const Default = { args: { default: "<p>Useful information to keep in mind.</p>" } };
