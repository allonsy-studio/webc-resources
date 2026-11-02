/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-card-grid",
	component: "norn-card-grid",
	argTypes: {
		default: { description: "The cards, each in an `<li>`." },
		min: { description: "Narrowest card, as a CSS length, such as `12rem`.", table: { defaultValue: { summary: "17rem" } } },
		gap: { description: "Space between cards: `s`, `m`, or `l`, for --norn-space-s, -m, or -l.", options: ["s", "m", "l"], table: { defaultValue: { summary: "m" } } },
	},
	parameters: {
		webc: {
			overrides: {
				"min table.defaultValue": "The default is the CSS fallback for an unset width, so the code does not say it.",
				"gap options": "`m` is the CSS default for an unset gap, so the code tests only `s` and `l`.",
				"gap table.defaultValue": "`m` is the CSS default for an unset gap, so the code does not say it.",
			},
			// The cards start at an h3, so each frame adds a hidden h2 after its hidden h1.
			hiddenH2: true,
		},
		docs: {
			description: {
				component: "Responsive grid of cards. Pass each card in an `<li>`, as in `<li><norn-card>…</norn-card></li>`. The list has `role=\"list\"`, which Safari needs once the markers are gone. Each card spans three rows of the grid, with `grid-template-rows: subgrid`, so the headings, the bodies, and the footers of cards in a row line up. A browser without subgrid shows each card as its own box. Settings for a card, such as its title face or its top line, go on the card as props: `<norn-card @title-face=\"mono\">`.",
			},
		},
	},
};

export const Default = {
	name: "Accent cycle",
	args: {
		default:
			'<li><norn-card><h3>Plain card</h3><p>A card with no link.</p></norn-card></li>\n<li><norn-card><h3><a href="https://example.com/">Linked card</a></h3><p>A card whose heading links somewhere.</p></norn-card></li>\n<li><norn-card><h3>Third card</h3><p>Cards share one fill, and a row lines up.</p></norn-card></li>\n<li><norn-card><h3>Fourth card</h3><p>A fourth card wraps to the next row when the grid is narrow.</p></norn-card></li>\n<li><norn-card><h3>Fifth card</h3><p>A fifth card, alone on its row at some widths.</p></norn-card></li>',
	},
};

export const Mono = {
	name: "Mono titles",
	args: {
		default: '<li><norn-card @title-face="mono"><h3><a href="https://example.com/core">@example/core</a></h3><p>The core package.</p></norn-card></li>\n<li><norn-card @title-face="mono"><h3><a href="https://example.com/cli">@example/cli</a></h3><p>The command line.</p></norn-card></li>',
	},
};

export const Aligned = {
	name: "Aligned rows",
	args: {
		default:
			'<li>\n\t<norn-card>\n\t\t<h3>Short</h3>\n\t\t<p>A short body.</p>\n\t\t<p><a href="https://example.com/">Read more</a></p>\n\t</norn-card>\n</li>\n<li>\n\t<norn-card>\n\t\t<h3>A heading that wraps onto a second and a third line in a narrow card</h3>\n\t\t<p>A longer body, so the bodies of the cards in a row differ in height. Each heading, body, and footer still starts at the same line across the row.</p>\n\t\t<p><a href="https://example.com/">Read more</a></p>\n\t</norn-card>\n</li>\n<li>\n\t<norn-card>\n\t\t<h3>No footer</h3>\n\t\t<p>A card without a third child leaves its footer row empty.</p>\n\t</norn-card>\n</li>',
	},
};
