/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Component/norn-theme-toggle",
	component: "norn-theme-toggle",
	argTypes: {
		label: { description: 'The group\'s name, as one element. Falls back to "Color scheme".' },
		light: { description: 'The light option\'s name. Falls back to "Light".' },
		system: { description: 'The system option\'s name. Falls back to "System".' },
		dark: { description: 'The dark option\'s name. Falls back to "Dark".' },
	},
	parameters: {
		docs: {
			description: {
				component:
					'Light, system, or dark: a `norn-segmented-control` that sets the page\'s `color-scheme` and remembers the choice in `localStorage` under `color-scheme`. System clears the choice, so the visitor\'s setting decides. Every toggle on the page, and in other tabs, follows the same choice. Without a script it stays hidden and the page follows the system. Pass `:@theme-toggle="true"` to `norn-head` so a saved choice applies before the first paint. The names are in the page, hidden, and the script shows them, since the toggle only exists with a script. Each falls back to the site\'s `componentStrings`, then English.',
			},
		},
	},
};
