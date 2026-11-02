/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-notice",
	component: "norn-notice",
	argTypes: {
		severity: { description: "How serious the message is." },
		live: { description: "Announce the notice when it appears." },
		prefix: { description: 'The severity word read before the message, with its punctuation, as one element, such as `<span slot="prefix">Remarque : </span>`. Falls back to the site\'s `componentStrings` for the severity, then "Note: ", "Success: ", "Warning: ", or "Error: ".' },
		default: { description: "The message." },
		action: { description: 'One action, such as a `norn-link-button` with `@variant="quiet"` and `@tone="current"`, so it reads in the text color and doesn\'t compete with the severity.' },
	},
	parameters: {
		docs: {
			description: {
				component: "A message about the page or the site: information, success, a warning, or an error, with an icon and an optional action. Color is never the only cue: the icon and a word for the severity, read but not shown, come first. The message goes in the default slot, and an action, such as a `norn-link-button`, in the `action` slot. A notice already on the page when it loads is static. Set `:@live=\"true\"` on one the page adds later, so a screen reader announces it: politely, or at once for a warning or an error.",
			},
		},
	},
};
