/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "OSS site/oss-credit",
	component: "oss-credit",
	parameters: {
		docs: {
			description: {
				component:
					"OSS credit lockup for the footer, light or dark by the scheme the page uses. Locked: it takes no props or slots. One SVG, inlined from the org's light and dark assets by `scripts/inline-svg.js` and cropped to the art. The two assets differ only in paint, so the script merges them: each changed `fill` and `stroke` reads `light-dark(light, dark)`, which follows the page's `color-scheme`, set by the visitor's preference or by CSS.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "component" },
	},
};

export const Default = {};
