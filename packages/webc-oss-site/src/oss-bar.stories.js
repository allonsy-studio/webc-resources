/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "OSS site/oss-bar",
	component: "oss-bar",
	parameters: {
		docs: {
			description: {
				component: "OSS banner, shown before the page's header: \"Brought to you by\" and the Allons-y Studio wordmark, live text on ink. Locked: it takes no props or slots. The wordmark sets \"Allons-y\" in Yellowtail with the magenta dash, then \"Studio\" in uppercase caps, and links to the studio. It wraps onto two lines on a narrow screen and grows with the text size.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "component" },
	},
};

export const Default = {};
