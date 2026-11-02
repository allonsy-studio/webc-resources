/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-toc",
	component: "norn-toc",
	argTypes: {
		items: { description: "The page's headings, in order.", type: { name: "array", required: true }, table: { type: { summary: "{ id: string, text: string, level: number }[]" } } },
		fold: { description: "When the list folds under its title: `always`, or `narrow`, while the nearest container is narrower than 60rem. Unset, it never folds." },
		label: { description: 'The landmark name and visible title, as one element. Falls back to the site\'s `componentStrings`, then "On this page".' },
	},
	parameters: {
		webc: {
			overrides: {
				"items type": "Required: with no headings the contents render nothing, and no setup function throws.",
				"items table.type": "The shape of each heading, which the code cannot say: the setup function reads its fields.",
			},
		},
		docs: {
			description: {
				component:
					"The page's contents: a link to each section heading, as an outline. Each heading sits in a nested list under the nearest heading above it with a lower level, so an h3 is listed inside the h2 it belongs to and a skipped level adds no empty list. The input stays flat. Data-driven, from `headings` (registered as `nornHeadings`), so it stays in step with the page. Its script marks the section in view with `aria-current=\"location\"`. The marked link takes the accent color. With fewer than two headings it renders nothing. The title is the summary of a `<details>`, shown open and unclickable unless `fold` says otherwise: then the list folds away under the title. `norn-docs` passes `narrow`. A browser without `::details-content` always shows the fold.",
			},
		},
	},
};
