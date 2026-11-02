/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Landmark/norn-pager",
	component: "norn-pager",
	argTypes: {
		prev: { description: "The page before this one.", table: { type: { summary: "{ url: string, title: string }" } } },
		next: { description: "The page after this one.", table: { type: { summary: "{ url: string, title: string }" } } },
		label: { description: 'The landmark name, read but not shown, as one element. Falls back to the site\'s `componentStrings`, then "Pager".' },
	},
	parameters: {
		webc: {
			overrides: {
				"prev table.type": "The object's shape: the code reads its fields, not their types.",
				"next table.type": "The object's shape: the code reads its fields, not their types.",
			},
		},
		docs: {
			description: {
				component: "Links to the pages before and after this one. Renders nothing when both are missing. Get the pages from `adjacent`, registered as `nornAdjacent`, at the call site. The arrows are `norn-icon`s, which point the other way in right-to-left text.",
			},
		},
	},
};

export const Both = { name: "Both neighbors", args: { prev: { url: "#previous", title: "Getting started" }, next: { url: "#next", title: "Reference" } } };

export const Next = { name: "Next only", args: { next: { url: "#next", title: "Usage" } } };
