/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-copy-button",
	component: "norn-copy-button",
	// The matrix has no Default story to start from, so each cell copies this.
	args: { value: "npm install @example/core" },
	argTypes: {
		value: { description: "The text to copy." },
		source: { description: "The id of the element whose text to copy, when there is no `value`." },
		compact: { description: 'Show only the icon until the pointer or focus is on the button, for a button laid over a corner, as `norn-code-block` does. On for `@compact`, `@compact="true"`, or `:@compact="true"`.' },
		surface: { description: "`base`, `raised`, or `code`: fill the button with that surface token, for a button laid over it, as `norn-code-block` does with `code`. Without it the button has no fill and sits on its surroundings." },
		strings: { description: 'The id of an element that holds the texts in place of the slots, for a component that wraps the button, as `norn-code-block` does. It holds one element per slot, marked `data-string="label"`, `"copy"`, `"copied"`, and `"failed"`; the `label` one needs an id.' },
		label: { description: 'The button\'s accessible name, such as "Copy the install command", as one element. Without it, the visible text names the button.' },
		copy: { description: 'The visible text, as one element. Falls back to the site\'s `componentStrings`, then "Copy".' },
		copied: { description: 'The text after a copy. Falls back to the site\'s `componentStrings`, then "Copied".' },
		failed: { description: 'The text when the copy fails. Falls back to the site\'s `componentStrings`, then "Copy failed".' },
	},
	parameters: {
		docs: {
			description: {
				component: "A button that copies text to the clipboard: `@value`, or the text of the element whose id is `@source`. It stays hidden without a script or where the Clipboard API is missing, so it never offers what it can't do. After a click its label reads the `copied` or `failed` text for two seconds, the icon turns to a check tinted in the success color, and a status message says the same to a screen reader. The button keeps its width, since the three texts share one cell. The texts are in the page, hidden, and the script shows them: the button only exists with a script.",
			},
		},
	},
};
