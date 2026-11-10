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
		striped: { description: "Tint every even body row with the raised surface, for a long table read across." },
		numeric: { description: "The columns that hold numbers, by position from 1 to 8, separated by spaces, such as `\"2 3\"`. They align at the end, with figures of one width." },
		note: { description: "A short note under the table, such as its source, in muted text. Phrasing content only: it renders in a paragraph." },
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

export const Striped = {
	name: "Striped, with numbers and a note",
	args: {
		striped: true,
		numeric: "2 3",
		default: '<table>\n\t<caption>Table 1. Bundle sizes</caption>\n\t<thead>\n\t\t<tr><th scope="col">Package</th><th scope="col">Files</th><th scope="col">Kilobytes</th></tr>\n\t</thead>\n\t<tbody>\n\t\t<tr><td>Patterns</td><td>42</td><td>118.4</td></tr>\n\t\t<tr><td>Code sample</td><td>6</td><td>9.1</td></tr>\n\t\t<tr><td>OSS site</td><td>12</td><td>31.0</td></tr>\n\t</tbody>\n</table>',
		note: "Sizes are before compression.",
	},
};
