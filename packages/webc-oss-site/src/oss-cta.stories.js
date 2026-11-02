/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "OSS site/oss-cta",
	component: "oss-cta",
	argTypes: {
		level: { description: "The heading level, to fit the page outline. Any other value gives the default." },
	},
	parameters: {
		docs: {
			description: {
				component:
					"OSS call to action, at the foot of the page. Locked: its copy and actions are fixed, and it takes no slots. The one setting is the heading level. Closes the page body, above the footer: the `cta` hook places it last. The Allons-y Studio name is signed in the signature face, Yellowtail, which `oss-head` declares. Its actions are `norn-link-button`s, colored by setting the global accent tokens on `oss-cta`. The one place Allons-y Studio's contact address appears. The mark is inlined from the org's assets by `scripts/inline-svg.js`.",
			},
		},
		// The OSS site group lists its components together, so the category is named here.
		webc: { category: "container" },
	},
};
