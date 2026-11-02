/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-code-tabs",
	component: "norn-code-tabs",
	argTypes: {
		group: { description: "Tabs with the same group, on any page, show the same choice." },
		default: { description: "The samples, each a `norn-code-block`. For the terminal frame, give each sample `@chrome=\"terminal\"`: a slot can't take props from the tabs." },
		label: { description: 'The tab list\'s name, as one element, such as `<span slot="label">Install commands</span>`. Falls back to the site\'s `componentStrings`, then "Code samples".' },
		sample: { description: 'A tab\'s name when its sample has no `data-tab`, caption, label, or language, with `{n}` for its number. Falls back to the site\'s `componentStrings`, then "Sample {n}".' },
	},
	parameters: {
		docs: {
			description: {
				component: "The same thing in a few forms, such as npm, yarn, and pnpm, as tabs over `norn-code-block`s. Without a script every sample shows, stacked. Pass the samples in the default slot. Each tab is named by the sample's `data-tab` attribute, else its caption, else its `label` slot, else its language, all read from the markup. A name two samples share gets a number after the first, such as `sh` and `sh 2`, so every tab name is its own. The tabs follow the ARIA tabs pattern: arrow keys move between them, in the reading direction, and Home and End jump to the ends. Tabs that share a `@group` switch together, and the choice is remembered in this browser.",
			},
		},
	},
};

export const Default = {
	name: "Package managers",
	args: {
		group: "package-manager",
		label: "<span>Install commands</span>",
		default: '<norn-code-block data-tab="npm" @language="sh" @code="npm install --save-dev @example/project"></norn-code-block>\n<norn-code-block data-tab="yarn" @language="sh" @code="yarn add -D @example/project"></norn-code-block>\n<norn-code-block data-tab="pnpm" @language="sh" @code="pnpm add -D @example/project"></norn-code-block>',
	},
};
