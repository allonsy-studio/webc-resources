/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/** The Text story's group, shared with the matrix so each cell draws a named control. */
const TEXT = {
	legend: "<span>View</span>",
	default: ['<label><input type="radio" name="view" value="list" checked /><span>List</span></label>', '<label><input type="radio" name="view" value="grid" /><span>Grid</span></label>', '<label><input type="radio" name="view" value="table" /><span>Table</span></label>'].join("\n"),
};

export default {
	title: "Component/norn-segmented-control",
	component: "norn-segmented-control",
	args: TEXT,
	argTypes: {
		"icon-only": { description: "Hides the option text visually; it stays the radio's name." },
		name: { description: "The radios' shared name. Required with `options`: the build fails without it." },
		options: { description: "The options, in place of the default slot. Each label is also its `title`.", table: { type: { summary: "{ value: string, label: string, icon?: string, checked?: boolean }[]" } } },
		legend: { description: 'The group\'s name, as one element, such as `<span slot="legend">Color scheme</span>`. Visually hidden. Required: the build fails without it.' },
		default: { description: "The option labels, when there are no `options`." },
	},
	parameters: {
		webc: {
			overrides: {
				"options table.type": "The items' shape: the code reads their fields, not their types.",
			},
		},
		docs: {
			description: {
				component:
					"A row of mutually exclusive options drawn as one control, from native radio buttons in a fieldset. No script: the browser handles the keyboard and the form value. Each option is a `<label>` holding an `<input type=\"radio\">`, an optional `norn-icon` with `@size=\"m\"`, and its text in a `<span>`. Give the radios one `name`, and the labels a `title` when the text is hidden. The checked option is tinted in the accent, and the others take a hover and a press layer. Options are drawn at equal widths. A component that builds one from its own props passes the `legend` slot, `@name`, and `:@options` instead, since its props don't reach slot content.",
			},
		},
	},
};

export const Text = {
	name: "Text options",
	args: TEXT,
};

export const Icons = {
	name: "Icon options",
	args: {
		"icon-only": true,
		legend: "<span>Color scheme</span>",
		default: [
			'<label title="Light"><input type="radio" name="scheme" value="light" /><norn-icon @name="sun" @size="m"></norn-icon><span>Light</span></label>',
			'<label title="System"><input type="radio" name="scheme" value="" checked /><norn-icon @name="system" @size="m"></norn-icon><span>System</span></label>',
			'<label title="Dark"><input type="radio" name="scheme" value="dark" /><norn-icon @name="moon" @size="m"></norn-icon><span>Dark</span></label>',
		].join("\n"),
	},
};
