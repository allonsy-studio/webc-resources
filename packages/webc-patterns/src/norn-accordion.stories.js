/*
 * SPDX-License-Identifier: MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export default {
	title: "Container/norn-accordion",
	component: "norn-accordion",
	argTypes: {
		default: { description: "The sections, each a `<details>`." },
	},
	parameters: {
		docs: {
			description: {
				component: "A stack of disclosures, from native `<details>` elements: the browser handles the keyboard, find-in-page, and links into a closed section. Pass each section as a `<details>` with a `<summary>` in the default slot. Give them one `name` to keep only one open at a time. A section slides open where the browser can animate to an intrinsic size, unless motion is reduced; elsewhere it opens at once.",
			},
		},
	},
};

export const Exclusive = {
	name: "One open at a time",
	args: {
		default:
			'<details name="faq" open>\n\t<summary>Does it need a script?</summary>\n\t<p>No. The browser opens and closes each section, and find-in-page opens a closed one.</p>\n</details>\n<details name="faq">\n\t<summary>Can two be open?</summary>\n\t<p>Not when they share a name. Leave the name off to let them open together.</p>\n</details>\n<details name="faq">\n\t<summary>Does it animate?</summary>\n\t<p>Where the browser can animate to an intrinsic size, unless motion is reduced.</p>\n</details>',
	},
};
