/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "OSS site/oss-head",
	component: "oss-head",
	parameters: {
		docs: {
			description: {
				component:
					"The OSS site head: the Instrument Sans and PT Mono preloads and the self-hosted `@font-face` rules for PT Mono, Instrument Sans, and Yellowtail, each with a fallback matched to its metrics. The OSS site plugin puts it in `norn-base`'s head hook, followed by the brand tokens from `css/tokens.css`. Call it elsewhere as `<meta webc:is=\"oss-head\" webc:nokeep />`. The `@font-face` rules look for the fonts at `assets/fonts`, one level up from the bundle: the OSS site plugin copies the package's `fonts` folder there. The brand tokens it goes with, in `css/tokens.css` and the `norn.oss` layer, are below. The brand rules in `css/brand.css` follow them in the same layer, such as the hero's eyebrow, accent underline, and the mark's four arcs, and the raised footer led by the project name in the mono face. A project's unlayered CSS still wins over both.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "document" },
	},
};
