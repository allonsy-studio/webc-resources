/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/** The Radios story's group, shared with the matrix so each cell draws a named group. */
const RADIOS = {
	legend: "<span>Reply by</span>",
	default: ['<label><input type="radio" name="reply" value="email" checked /> Email</label>', '<label><input type="radio" name="reply" value="phone" /> Phone</label>', '<label><input type="radio" name="reply" value="none" /> No reply needed</label>'].join("\n"),
};

export default {
	title: "Component/norn-choice",
	component: "norn-choice",
	args: RADIOS,
	argTypes: {
		inline: { description: "Sets the options in a wrapping row instead of a column." },
		legend: { description: 'The group\'s name, as one element, such as `<span slot="legend">Reply by</span>`. Required: the build fails without it.' },
		default: { description: 'The options: each a `<label>` holding an `<input type="checkbox">` or `<input type="radio">`, then its text.' },
	},
	parameters: {
		docs: {
			description: {
				component:
					"Checkboxes or radios in a fieldset, named by its legend. Each option is a `<label>` holding its native input, then its text, so a click anywhere on the label sets it. The boxes are drawn at 1.25em with a strong edge and a hover layer; a checked one fills with the accent and shows a tick or a dot. Give a radio group one `name`. In forced colors the native controls return. For one choice from a few drawn as a single control, use `norn-segmented-control`.",
			},
		},
	},
};

export const Radios = {
	name: "Radios",
	args: RADIOS,
};

export const Checkboxes = {
	name: "Checkboxes",
	args: {
		legend: "<span>Topics</span>",
		default: ['<label><input type="checkbox" name="topics" value="css" checked /> CSS</label>', '<label><input type="checkbox" name="topics" value="a11y" /> Accessibility</label>', '<label><input type="checkbox" name="topics" value="components" disabled /> Web components (full)</label>'].join("\n"),
	},
};

export const Inline = {
	name: "In a row",
	args: {
		inline: true,
		legend: "<span>Size</span>",
		default: ['<label><input type="radio" name="size" value="s" /> Small</label>', '<label><input type="radio" name="size" value="m" checked /> Medium</label>', '<label><input type="radio" name="size" value="l" /> Large</label>'].join("\n"),
	},
};
