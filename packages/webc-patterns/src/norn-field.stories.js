/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-field",
	component: "norn-field",
	args: {
		default: '<label for="field-name">Name</label>\n<input id="field-name" type="text" autocomplete="name" />',
	},
	argTypes: {
		default: { description: "A `<label>` and the control it names: an `<input>`, a `<textarea>`, or a `<select>`." },
		hint: { description: 'Help shown under the control, such as `<span slot="hint">As on your ID</span>`.' },
		error: { description: 'The error message, without its prefix, such as `<span slot="error">Add the part after the @.</span>`. Hidden while empty; filled, it also marks the control.' },
		"error-prefix": { description: "The word read before the error message." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"A labeled text control: a `<label>` and an `<input>`, `<textarea>`, or `<select>`, with an optional hint and error message under it. The control takes the control height, a strong edge, and a hover layer; `readonly` draws a dashed edge, `disabled` a raised fill. After the visitor touches it, an invalid control (`:user-invalid`, or `aria-invalid=\"true\"`) takes the danger edge, as does any control with an error in its slot. A script points the control's `aria-describedby` at the hint and the error; without it, give them an id and link them yourself. Mark a required field with the `required` attribute, and a visible asterisk in the label inside `aria-hidden=\"true\"`. Group checkboxes and radios with `norn-choice`.",
			},
		},
	},
};

export const Text = {
	name: "Text field",
};

export const Hint = {
	name: "With a hint",
	args: {
		default: '<label for="field-handle">Handle <span aria-hidden="true">*</span></label>\n<input id="field-handle" type="text" required />',
		hint: '<span slot="hint">Lowercase letters, numbers, and dashes.</span>',
	},
};

export const Invalid = {
	name: "With an error",
	args: {
		default: '<label for="field-email">Email</label>\n<input id="field-email" type="email" value="cassondra" aria-invalid="true" />',
		error: '<span slot="error">Add the part after the @.</span>',
	},
};

export const Textarea = {
	name: "Text area",
	args: {
		default: '<label for="field-message">Message</label>\n<textarea id="field-message"></textarea>',
	},
};

export const Select = {
	name: "Select",
	args: {
		default: '<label for="field-topic">Topic</label>\n<select id="field-topic"><option>Speaking</option><option>Consulting</option><option>Something else</option></select>',
	},
};

export const States = {
	name: "Read-only and disabled",
	args: {
		default: '<label for="field-id">Order number</label>\n<input id="field-id" type="text" value="A-1024" readonly />',
	},
};
