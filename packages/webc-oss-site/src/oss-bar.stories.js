/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "OSS site/oss-bar",
	component: "oss-bar",
	argTypes: {
		"--oss-navy": { description: "Banner background. Defined here.", control: "color", table: { category: "css custom properties" } },
		"--oss-link": { description: "Focus ring color. Defined here.", control: "color", table: { category: "css custom properties" } },
	},
	parameters: {
		docs: {
			description: {
				component: "OSS banner, shown before the page's header. Locked: it takes no props or slots. The SVG is inlined from the org's assets by `scripts/inline-svg.js`, cropped to the lockup. It shows at full size from 31.25rem up and scales down below that, so the text stays readable on a phone and grows with the text size.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "component" },
	},
};

export const Default = {};
