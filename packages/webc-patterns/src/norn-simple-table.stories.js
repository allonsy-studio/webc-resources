/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-simple-table",
	component: "norn-simple-table",
	argTypes: {
		default: { description: "The table." },
		label: { description: "The region's name while it scrolls, as one element, hidden. Falls back to the caption, then the column headings, so the name is always in the page's language." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"A native table that scrolls sideways inside its own box when it is wider than the page, so the page never does. A column keeps a readable width instead of being crushed, so a narrow screen scrolls the table, and a shadow at an edge says there is more that way. Pass the `<table>` in the default slot, with a `<caption>` when it can have one. Cells and code in them wrap between words, never mid-word. While the box scrolls, as it does on a narrow screen, its script makes it a tab stop named by the caption, so a keyboard can scroll it. `scrollTables` in `@allons-y/webc-patterns/markdown` writes the same markup for Markdown tables. Row rules take --norn-ui-border-color, and the scroll shadows are drawn against the page surface, --norn-surface-base. The header row has no fill.",
			},
		},
	},
};

export const Default = {
	name: "Wide table",
	args: {
		default:
			'<table>\n\t<caption>Options</caption>\n\t<thead>\n\t\t<tr><th scope="col">Option</th><th scope="col">Type</th><th scope="col">Default</th><th scope="col">Description</th></tr>\n\t</thead>\n\t<tbody>\n\t\t<tr><td><code>outputDirectory</code></td><td><code>string</code></td><td><code>"_site"</code></td><td>Where the build writes its pages.</td></tr>\n\t\t<tr><td><code>pathPrefix</code></td><td><code>string</code></td><td><code>"/"</code></td><td>A path every URL starts with, for a site in a subfolder.</td></tr>\n\t\t<tr><td><code>dropEmptyBundleTags</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Removes a link or script whose bundle came out empty.</td></tr>\n\t</tbody>\n</table>',
	},
};
