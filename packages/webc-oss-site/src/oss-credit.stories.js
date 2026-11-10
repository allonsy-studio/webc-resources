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
				component: "OSS credit for the footer's last column: \"Built & maintained by Allons-y Studio\", linked to the studio, over the \"Allons-y!\" sign-off in Yellowtail. Locked: it takes no props or slots. Live text in the footer's colors, so it follows the page's color scheme.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "component" },
	},
};

export const Default = {};
