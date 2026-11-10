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
		image: { description: "An image across the top of the card, cropped to 16:9, such as `<img slot=\"image\" src=\"…\" alt=\"\">`. A card with an image lays out on its own, so keep image cards in a row of their own." },
		accent: { description: "A 2px line along the top, in a global color: `accent` takes --norn-ui-accent, and `info`, `success`, `warning`, and `danger` take the matching --norn-status-* color. `none` draws no line." },
		"title-face": { description: "`mono` sets the heading in the mono face, as for package names." },
	},
	parameters: {
		docs: {
			description: {
				component: "A card: a heading, then its text, on a raised surface. A heading link makes the whole card a link, and a card with an accent has a 2px line along its top. Pass the heading and body in the default slot, as in `<norn-card><h3><a href=\"…\">Title</a></h3><p>…</p></norn-card>`. Pick the heading level for the outline: h3 under an h2. A link in the heading is stretched over the card, so the card is one target. The pointer over the card takes a hover layer, and focus on the link draws the ring around the card. The link is not underlined until the pointer is over it. In a `norn-card-grid` the cards share their rows: the first child, the second, and the third (a footer, such as a link) each take a row shared with the neighboring cards, so they line up. A card with a fourth child lays out on its own.",
			},
		},
		// The default slot starts at an h3, so each frame adds a hidden h2 after its hidden h1.
		webc: { hiddenH2: true },
	},
};

export const Default = { name: "Plain", args: { default: "<h3>Plain card</h3>\n<p>A short line of body text.</p>" } };

export const Linked = { name: "Linked heading", args: { default: '<h3><a href="https://example.com/">Linked card</a></h3>\n<p>A short line of body text.</p>' } };

export const Long = {
	name: "Long text",
	args: { default: "<h3>Configure the build for a project with several workspaces and a shared theme</h3>\n<p>Each workspace keeps its own pages and data. The shared theme sets the colors, the type, and the spacing once, and every workspace follows it.</p>" },
};

export const Image = {
	name: "With an image",
	args: {
		default: '<h3><a href="https://example.com/">Card with an image</a></h3>\n<p>A short line of body text.</p>',
		image: '<img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22%3E%3Crect width=%2216%22 height=%229%22 fill=%22%23c9ced8%22/%3E%3C/svg%3E" alt="">',
	},
};

export const ArrowLink = {
	name: "Footer link",
	args: { default: '<h3>Card with a footer link</h3>\n<p>A short line of body text.</p>\n<p><a href="https://example.com/">Read the post</a></p>' },
};
