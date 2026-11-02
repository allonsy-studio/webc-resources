/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-card",
	component: "norn-card",
	argTypes: {
		default: { description: "The heading, then the body." },
	},
	parameters: {
		docs: {
			description: {
				component: "A card: a heading, then its text, on a raised surface. A heading link makes the whole card a link, and a card with an accent has a 2px line along its top. Pass the heading and body in the default slot, as in `<norn-card><h3><a href=\"…\">Title</a></h3><p>…</p></norn-card>`. Pick the heading level for the outline: h3 under an h2. A link in the heading is stretched over the card, so the card is one target. The pointer over the card takes a hover layer, and focus on the link draws the ring around the card. The link is not underlined until the pointer is over it. `norn-card-grid` sets the inherited `--norn-card-rows` to `subgrid` for its cards. It is not a setting: leave it alone elsewhere. In a `norn-card-grid` the first child, the second, and the third (a footer, such as a link) each take a row shared with the neighboring cards, so they line up. A card with a fourth child lays out on its own.",
			},
		},
		// The default slot starts at an h3, so each frame adds a hidden h2 after its hidden h1.
		webc: { hiddenH2: true },
	},
};

export const Default = { name: "Plain", args: { default: "<h3>Plain card</h3>\n<p>A card with a heading and a body, and no link.</p>" } };

export const Linked = { name: "Linked heading", args: { default: '<h3><a href="https://example.com/">Linked card</a></h3>\n<p>Put a link in the heading to link the card.</p>' } };

export const Long = {
	name: "Long text",
	args: { default: "<h3>A heading that runs long enough to wrap onto a second line in a narrow frame</h3>\n<p>The body wraps too. Resize the canvas to a phone width to see how the card holds its padding and its top band, and try --norn-ui-border-radius in the tokens.</p>" },
};
